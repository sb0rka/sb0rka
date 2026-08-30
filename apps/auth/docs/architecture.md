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

Маршрутизация — `net/http.ServeMux` (`transport/router.go`). `authMiddleware` проверяет `Authorization: Bearer <jwt>` через `service.ParseAndVerifyAccessTokenFromAuthHeader` и кладёт identity в стандартный `authctx`. Мутации поверх — `requireLiveSessionMiddleware` (проверка живой сессии). Private-модули могут явно выбрать `route.OptionalBrowserSession`; только такие маршруты пытаются аутентифицироваться существующей refresh-cookie, но при её отсутствии продолжают работу анонимно. Неизвестный режим доступа прерывает запуск сервиса.

## Ключевые потоки

**Регистрация** (`POST /identity/users`). Валидация (опц. телефон — флаг `IS_PHONE_REQUIRED`), создание `subjects` + `users` (пароль — хеш). Возвращает пользователя.

**Логин** (`POST /auth/login`). По `username`/`email` + паролю: проверка хеша → создаётся `auth_sessions` (refresh-токен хранится хешем), выдаётся короткоживущий access-JWT (`ACCESS_TOKEN_TTL_SEC`) и refresh-токен в cookie (имя/secure/samesite — env `REFRESH_TOKEN_COOKIE_*`).

**Refresh** (`POST /auth/refresh`). По refresh-cookie находит живую сессию, ротирует refresh-токен (`replaced_by`), выдаёт новый access-токен. Срок сессии — `ACCESS_SESSION_TTL_SEC`.

**Investigation agent delegation** (`POST /auth/agent-tokens/investigation`). После обычной JWT-проверки и live-session guard Auth передаёт исходный Bearer в `GET {PLATFORM_API_BASE_URL}/projects/{project_id}`. Успешный project read разрешает выпуск отдельного Ed25519 JWT с `typ=agent+jwt`, единственной audience `ir-mcp`, фиксированными scopes, project/investigation binding и TTL 4 часа. Токен не хранится в БД, не логируется и не заменяет пользовательский `access+jwt` в Platform REST API.

**Investigation agent exchange** (`POST /auth/agent-tokens/exchange`). Только настроенный confidential client `ir-api` может предъявить agent JWT и получить обычный access JWT с теми же `sub`/`sid` и TTL `ACCESS_TOKEN_TTL_SEC`. Перед выпуском Auth повторно проверяет подпись, `investigation.gateway.read` и живую исходную сессию. Короткий токен нужен IR для существующей цепочки Gateway → Platform Secrets, агенту не возвращается и нигде не сохраняется.

**OIDC browser session.** Community OIDC routes явно используют optional browser session. Middleware проверяет и хеширует настроенную refresh-cookie, затем одним read-only запросом разрешает текущую живую native-сессию активного пользователя. Он не блокирует и не изменяет строки, не ротирует cookie и не принимает Bearer token вместо неё. История `replaced_by` хранится не короче жизни family: обратный обход даёт стабильный `auth_time` первой сессии family, а OIDC handler получает только `subject_id`, `subject_kind=user`, текущий `session_id` и это время. Отсутствующая, повреждённая, истёкшая или отозванная cookie оставляет authorization request анонимным и переводит пользователя на community login.

**OIDC/OAuth delegation.** При полной OIDC env/file-конфигурации общий Auth transport регистрирует discovery/JWKS/authorize/token/revoke. Authorization требует active user с `email_verified_at`, точные client/redirect/scope, `state`, 256-bit `nonce` и PKCE S256. Code exchange создаёт OAuth-bound session с настроенным `oauth_client_id` и возвращает RS256 ID token с профилем/nonce, отдельный EdDSA Platform access token и opaque refresh token. OAuth refresh вращает family под `SELECT ... FOR UPDATE`; повтор заменённого token отзывает family. Native `/auth/refresh` принимает только session с `oauth_client_id=NULL`. Краткий протокол описан в [oidc-oauth.md](oidc-oauth.md).

Production-cookie по умолчанию называется `__Host-refresh_token` и имеет пустой `Domain`, `Secure=true`, `Path=/`, `HttpOnly=true`, `SameSite=Lax`. Несовместимая с префиксом `__Host-` конфигурация отклоняется при запуске; для локальной HTTP-разработки можно настроить cookie без этого префикса.

**Живая сессия.** Функция `auth.is_live_session(sid, sub)` (миграции `db/migrations/auth/`) проверяет, что сессия существует, не отозвана и не истекла. Её зовёт и `apps/auth` (для мутаций), и `apps/api` (его `requireLiveSessionMiddleware`) — поэтому схема `auth` должна быть в той же БД, что и платформенная.

**Организации.** `organizations` + `organization_members` с ролями (`owner`/`admin`/…); доступ — RBAC (`authz/rbac.go`), deny-by-default.

## Модель данных (схема `auth`)

`subjects` (общий идентификатор актора), `users` (логин/email/хеш пароля/`email_verified_at` → subject), `auth_sessions` (refresh-сессии: хеш токена, client binding, ip/ua, expires, revoke), `oidc_auth_requests` (короткоживущие request/code state), `organizations` + `organization_members`, `version_auth` (версия миграций).

## Связь с platform-БД

В деплое `auth` и `api` делят один PostgreSQL: схема `auth` (этот сервис) и схема `api` (платформа) в одной БД, `search_path` включает обе. Это нужно, чтобы `apps/api` мог вызвать `auth.is_live_session` на своём соединении.
