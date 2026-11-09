# auth

Auth API платформы Sb0rka: регистрация и аутентификация пользователей, выпуск JWT, refresh-сессии, организации.

Русский | [English](README_EN.md)

Подписывает короткоживущие access-токены (Ed25519), которые API, SoM и Relay проверяют по публичному JWKS. Устройство — [docs/architecture.md](docs/architecture.md).

## Запуск

```bash
go run ./apps/auth/cmd/auth server
```

Сборка: `go build -o bin/auth ./apps/auth/cmd/auth`. Локальный стенд — `docker-compose.dev.yml` (см. навык `.claude/skills/local-dev`).

## Команды

| Команда | Назначение |
| --- | --- |
| `server` | Запуск HTTP-сервера |
| `token` | Сгенерировать приватный ключ подписи токенов |
| `version` | Печать версии |

## Эндпоинты (основное)

| Метод и путь | Назначение |
| --- | --- |
| `POST /identity/users` | Регистрация пользователя |
| `POST /auth/login` | Логин → `access_token` + refresh-cookie |
| `POST /auth/refresh` | Обновить access-токен по refresh-cookie |
| `POST /auth/logout` | Выйти (отозвать сессию) |
| `GET /auth/subject` | Текущий субъект из токена |
| `GET /auth/sessions`, `DELETE /auth/sessions[/{id}]` | Список/отзыв сессий |
| `GET/PATCH/DELETE /identity/users/current` | Профиль текущего пользователя |
| `GET/POST/PATCH /identity/organizations[...]` | Организации |
| `GET /.well-known/openid-configuration`, `GET /oauth2/jwks` | OIDC discovery/JWKS, если задана полная OIDC-конфигурация |
| `GET /oauth2/authorize`, `POST /oauth2/token`, `POST /oauth2/revoke` | OIDC authorization code + PKCE, refresh rotation и revoke для зарегистрированных клиентов |

## Конфигурация (env)

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `SERVER_ADDR` / `SERVER_PORT` | `localhost` / `8020` | адрес и порт |
| `DATABASE_URI` | `postgres://…/auth` | подключение к БД (схема `auth`) |
| `ACCESS_TOKEN_PRIVATE_KEY` / `…_FILE_PATH` | — | Ed25519-ключ подписи, доступный только Auth |
| `AUTH_BASE_URL` / `ACCESS_TOKEN_KID` | `http://localhost:8020` / `ed25519-v1` | claims токена |
| `ACCESS_SESSION_TTL_SEC` | `604800` | TTL login-сессии; TTL access JWT фиксирован на 300 с |
| `REFRESH_TOKEN_COOKIE_*` | `__Host-refresh_token`, secure, path `/`, host-only, httpOnly, lax | параметры refresh-cookie; для `__Host-` контракт проверяется при запуске |
| `IS_PHONE_REQUIRED` | `false` | требовать телефон при регистрации |
| `AUTH_BASE_URL` / `OIDC_LOGIN_URL` | — | canonical issuer и community console login URL |
| `SB0RKA_*_CLIENT_SECRET` / `SB0RKA_SOM_ATTESTATION_SECRET` | — | секреты confidential-клиентов; имя переменной задаёт `secret_env` в `platform_clients.policy`. Клиент без переменной не инициализируется |
| `OIDC_SIGNING_PRIVATE_KEY_FILE_PATH` / `OIDC_SIGNING_KID` | — | путь к RSA PKCS#8 PEM key и `kid` для RS256 ID token |
| `OIDC_PROVIDER_CRYPTO_KEY_FILE_PATH` | — | путь к файлу с 32-byte AES-GCM key для authorization request/code envelope |
| `OIDC_CODE_HMAC_KEY_FILE_PATH` | — | путь к отдельному файлу с ≥32-byte HMAC key для hash authorization code |
