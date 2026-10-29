---
title: "Архитектура Platform API"
description: "Слои, жизненный цикл запроса и ключевые потоки сервиса apps/api: аутентификация, RBAC, создание базы данных, шифрование секретов и сборка мусора."
---

Документ для разработчиков и кодовых агентов: карта `apps/api`, которую нельзя вывести из одного файла. Структуру БД см. в [`db/SCHEMA.md`](../../../db/SCHEMA.md), контракт эндпоинтов — в Swagger UI (`/swagger`).

## Слои

Зависимости строго направлены вниз, не смешиваются:

```
transport/  (HTTP: роутер, middleware, хендлеры по доменам)
   ↓ интерфейсы
service/    (бизнес-логика, валидация, крипто)
   ↓ интерфейс store/db.Database
store/db/   (pgx, единственная дверь к PostgreSQL)
   ↓
domain/model/ (доменные структуры)
```

Слои развязаны интерфейсами, которые собираются в `runtime.Dependencies` (`transport/runtime/deps.go`) и прокидываются в каждый хендлер:

- `store/db.Database` — доступ к БД (реализация `PsqlDB`);
- `authz.Authorizer` — RBAC (реализация `RBACAuthorizer`);
- `service.SecretCrypto` — шифрование секретов (реализация `TinkAEADSecretCrypto`);
- `telemetry.Service` — метрики из Prometheus.

Всё собирается в `cmd/api/main.go` (`serverCMD`) и передаётся в `transport.NewServer`.

## Жизненный цикл запроса

Маршрутизация — стандартный `net/http.ServeMux` (Go 1.22, паттерны вида `GET /projects/{project_id}`) в `transport/router.go`. Внешние middleware (общие для всех): `loggerMiddleware → corsMiddleware → panicMiddleware`.

Две обёртки доступа:
- `authOnly` = `authMiddleware` (проверка JWT) — для чтения;
- `authLive` = `authMiddleware` + `requireLiveSessionMiddleware` (живая сессия) — для мутаций.

Типичный хендлер (эталон — `transport/projects/handlers.go`):

```
1. parseSubjectID / extractSubjectIdentity   — кто (из context)
2. parsePathID                                — параметры пути
3. h.authorize(... authz.ActionXxx ...)       — можно ли (RBAC)
4. decode body (DisallowUnknownFields)        — строгий разбор тела
5. service.Validate… / Normalize…             — валидация входа
6. h.deps.PlatformDatabase.…                  — поход в БД
7. errors.Is(err, db.ErrXxx) → HTTP-код       — маппинг ошибок стора
8. toX(model) → contract.XResponse            — маппинг в DTO наружу
```

JSON-форматы запросов/ответов живут в `packages/contract` (общие с CLI `s0c`) — это единственный источник правды по контракту. Маппинг `model → contract` — функциями `toX` в хендлере.

Параметры пути `project_id` и `resource_id` содержат `public_id`: 10 и 12 строчных hex-символов соответственно. Существующий запрос членства фильтрует проект по `public_id` и возвращает UUID; отсутствие членства дает `403`. Первый запрос ресурса фильтрует его по `public_id`. Дальнейшие проверки, связи, квоты и AAD используют UUID из результатов. JWT содержит UUID.

## Identity: мост JWT → context

`authMiddleware` (`transport/middlewares.go`) проверяет `Authorization: Bearer <jwt>` через `service.ParseAndVerifyAccessTokenFromAuthHeader` (Ed25519/EdDSA, claims `sub`/`sid`/`sk`/`jti`) и кладёт identity в `context` через `runtime.WithAuthIdentity`. Дальше хендлеры читают её геттерами `runtime.AuthSubjectIDFromContext` и т.п. Сам `apps/api` токены **не выдаёт** — это делает `apps/auth`.

`requireLiveSessionMiddleware` для мутаций вызывает `auth.is_live_session()` в БД — функцию и сессии предоставляет `apps/auth`.

## RBAC

Deny-by-default (`authz/`). `RBACAuthorizer.Authorize` смотрит роль субъекта в проекте (`project_members`) и матрицу `rolePermissions` (`authz/rbac.go`): роли `owner`/`admin`/`editor`/`viewer` × действия `authz.Action`. Любой неизвестный тип ресурса или не-член → отказ. Новое действие = константа `Action` (`authorizer.go`) + запись в матрице для нужных ролей. Бизнес-инварианты поверх RBAC (например «нельзя удалить последнего owner») — в хендлере.

## Поток: создание базы данных

Самый сложный мульти-сущностный поток (`transport/dbis/handlers.go` `CreateDBInstance` → `store/db.CreateDatabase`):

1. Auth + RBAC (`ActionDBCreate`), валидация имени (`NormalizeDatabaseName` → lowercase/`_`), проверка квот (`AssertCanCreateResourceWithType`).
2. `GenerateAlphaNumPassword` — пароль будущей БД (в открытом виде существует только здесь, в памяти запроса).
3. `GenerateResourceID` для базы и для её password-секрета.
4. `GetActiveEncryptionKey` → активный ключ из `encryption_keys`.
5. `BuildSecretAAD(projectID, secretID, version=1, server_managed)` → AAD.
6. `SecretCrypto.Encrypt(пароль, aad, key.KeyRef)` → шифртекст.
7. `GeneratePostgresSCRAMSHA256Verifier(пароль)` → SCRAM-verifier (то, что хранит сам Postgres).
8. `CreateDatabase(params)` — **одна транзакция**, создает согласованный набор: `dbis` + `resource_states` (database), `secrets` (имя `DATABASE_<public_id>_PASSWORD`) + `secret_versions` v1 + `secret_version_materials` (envelope), `dbi_verifiers` (verifier + `password_secret_id`, desired=`present`), системный тег `db_secret` со значением `<db_public_id>_<secret_public_id>` (`resource_tags`).

Описание password-секрета содержит public ID базы. Пароль и связанный с БД секрет при очистке находятся по UUID-связи `dbi_verifiers.password_secret_id`. Теги служат для отображения и не влияют на выбор ресурсов для очистки.

Итог: пароль нигде не лежит в открытом виде — только зашифрованный материал + SCRAM-verifier. Реальный инстанс PostgreSQL поднимает внешний оркестратор по desired-state (в репозитории его нет).

## Шифрование секретов

`service/secret_crypto.go`: Tink **AEAD** (AES-256-GCM), envelope. Ключевой инвариант — **AAD**: `BuildSecretAAD` привязывает шифртекст к `purpose/project_id/secret_id/version_no/protection_class`. При расшифровке AAD должен совпадать байт-в-байт, иначе Tink откажет — это защищает от подмены/переноса шифртекста между секретами/версиями. Ключевой материал (Tink keyset) живёт вне БД (env/файл); в `encryption_keys` — только метаданные (`provider`/`key_ref`/`status`). `key_ref` из БД резолвится в примитив через `TinkKeysetResolver`.

## Desired-state vs runtime + GC

По всей схеме разделены «желаемое» и «фактическое» состояние:
- желаемое пишет API (`dbis.desired_runtime_state`, `dbi_verifiers.password_desired_state`);
- фактическое приводит к нему внешний реконсилятор (`resource_states.runtime_state`).

`apps/drones` (фоновый GC) по тикеру вызывает SQL-функцию `api.cleanup_one_deleted_dbi()` (`SECURITY DEFINER`, `SKIP LOCKED` — безопасна для нескольких воркеров). Она по одной зачищает удалённые базы: когда база в `desired_runtime_state='terminated'`, и БД, и её password-секрет в `runtime_state='deleted'`, а `password_desired_state='absent'` — удаляет ресурс БД и ресурс секрета одной транзакцией. Отсутствие тегов и их привязок не препятствует удалению. Теги этих ресурсов удаляются, если после очистки у них не осталось привязок к другим ресурсам.

## Критические инварианты безопасности

- Plaintext секретов/паролей **не логировать**; reveal-ответы — с `Cache-Control: no-store`.
- AAD при шифровании и расшифровке должны совпадать.
- RBAC — deny-by-default; новое действие требует записи в матрице.
- В платформенной БД пароль БД хранится только зашифрованным + как SCRAM-verifier.
