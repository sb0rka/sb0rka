# auth

Auth API платформы Sb0rka: регистрация и аутентификация пользователей, выпуск JWT, refresh-сессии, организации.

Русский | [English](README_EN.md)

Подписывает короткоживущие access-токены (Ed25519), которые проверяет `apps/api` тем же ключом. Устройство — [docs/architecture.md](docs/architecture.md). Схема БД — [db/SCHEMA.md](../../db/SCHEMA.md).

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

## Конфигурация (env)

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `SERVER_ADDR` / `SERVER_PORT` | `localhost` / `8020` | адрес и порт |
| `DATABASE_URI` | `postgres://…/auth` | подключение к БД (схема `auth`) |
| `ACCESS_TOKEN_PRIVATE_KEY` / `…_FILE_PATH` | — | Ed25519-ключ подписи (общий с `api`) |
| `ACCESS_TOKEN_ISSUER` / `…_AUDIENCE` / `…_KID` | `auth.local` / `api.local` / `ed25519-v1` | claims токена |
| `ACCESS_TOKEN_TTL_SEC` / `ACCESS_SESSION_TTL_SEC` | `300` / `604800` | TTL access-токена и сессии |
| `REFRESH_TOKEN_COOKIE_*` | `__Host-refresh_token`, secure, path `/`, host-only, httpOnly, lax | параметры refresh-cookie; для `__Host-` контракт проверяется при запуске |
| `IS_PHONE_REQUIRED` | `false` | требовать телефон при регистрации |
