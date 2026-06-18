---
title: "Архитектура Auth API"
description: "Слои, потоки и модель данных apps/auth: регистрация, логин, refresh-сессии, проверка живой сессии, RBAC организаций."
---

Документ для разработчиков и кодовых агентов. Общая картина системы — в [корневом ARCHITECTURE.md](../../../ARCHITECTURE.md). Структура БД — в [db/SCHEMA.md](../../../db/SCHEMA.md).

## Слои

Та же слоистость, что в `apps/api`, зависимости направлены вниз:

```
transport/  (HTTP: роутер, middleware, хендлеры auth/users/organizations)
   ↓ интерфейсы
service/    (бизнес-логика, валидация, хеширование паролей, выпуск токенов)
   ↓ интерфейс store/db.Database
store/db/   (pgx, единственная дверь к PostgreSQL)
   ↓
domain/model/ (subjects, users, sessions, organizations)
```

`apps/auth` подписывает access-токены приватным Ed25519-ключом; `apps/api` проверяет их **тем же ключом** (общий `ACCESS_TOKEN_PRIVATE_KEY`, совпадающие `issuer/audience/kid`).

## Жизненный цикл запроса

Маршрутизация — `net/http.ServeMux` (`transport/router.go`). `authMiddleware` проверяет `Authorization: Bearer <jwt>` через `service.ParseAndVerifyAccessTokenFromAuthHeader` и кладёт identity в `context` (`runtime.WithAuthIdentity`). Мутации поверх — `requireLiveSessionMiddleware` (проверка живой сессии). RBAC организаций — внутри хендлера через `Authorizer.Authorize` с `authz.Action`.

## Ключевые потоки

**Регистрация** (`POST /identity/users`). Валидация (опц. invite-код / телефон — флаги `IS_INVITE_REQUIRED`/`IS_PHONE_REQUIRED`), создание `subjects` + `users` (пароль — хеш). Возвращает пользователя.

**Логин** (`POST /auth/login`). По `username`/`email` + паролю: проверка хеша → создаётся `auth_sessions` (refresh-токен хранится хешем), выдаётся короткоживущий access-JWT (`ACCESS_TOKEN_TTL_SEC`) и refresh-токен в cookie (имя/secure/samesite — env `REFRESH_TOKEN_COOKIE_*`).

**Refresh** (`POST /auth/refresh`). По refresh-cookie находит живую сессию, ротирует refresh-токен (`replaced_by`), выдаёт новый access-токен. Срок сессии — `ACCESS_SESSION_TTL_SEC`.

**Живая сессия.** Функция `auth.is_live_session(sid, sub)` (миграции `db/migrations/auth/`) проверяет, что сессия существует, не отозвана и не истекла. Её зовёт и `apps/auth` (для мутаций), и `apps/api` (его `requireLiveSessionMiddleware`) — поэтому схема `auth` должна быть в той же БД, что и платформенная.

**Организации.** `organizations` + `organization_members` с ролями (`owner`/`admin`/…); доступ — RBAC (`authz/rbac.go`), deny-by-default.

## Модель данных (схема `auth`)

`subjects` (общий идентификатор актора), `users` (логин/email/хеш пароля → subject), `auth_sessions` (refresh-сессии: хеш токена, ip/ua, expires, revoke), `user_invites` (инвайты), `organizations` + `organization_members`, `version_auth` (версия миграций). Подробности — в [db/SCHEMA.md](../../../db/SCHEMA.md).

## Связь с platform-БД

В деплое `auth` и `api` делят один PostgreSQL: схема `auth` (этот сервис) и схема `api` (платформа) в одной БД, `search_path` включает обе. Это нужно, чтобы `apps/api` мог вызвать `auth.is_live_session` на своём соединении.
