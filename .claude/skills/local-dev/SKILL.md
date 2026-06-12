---
name: local-dev
description: Как поднять компоненты Sb0rka локально (Postgres, миграции, API, proxy-ql-executor, drones) и обойти отсутствующие в репозитории сервисы (auth, nl2sql, оркестратор). Используй, когда нужно запустить проект на машине, отладить API локально или сгенерировать тестовый JWT.
---

# Локальный запуск Sb0rka

## Что запускается, а что нет

Полностью платформа из репозитория **не поднимается** — отсутствуют: auth-сервис (выдаёт JWT, `/auth/*`, функция `auth.is_live_session`), nl2sql и оркестратор PostgreSQL-инстансов.

Работает локально: **Postgres + миграции + `apps/api` + `apps/proxy-ql-executor` + `apps/drones`**. Консоль откроется, но логин упрётся в отсутствующий auth.

## 1. Postgres + миграции

Схема платформы — `api` (дрон хардкодит `api.`, код API шлёт запросы без префикса → нужен `search_path`).

```powershell
docker run -d --name sb-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=platform -p 5432:5432 postgres:18
$env:PGPASSWORD = "postgres"; $H = "-h","localhost","-U","postgres","-d","platform"
psql @H -c "CREATE SCHEMA IF NOT EXISTS api;"
psql @H -c "ALTER DATABASE platform SET search_path = api, public;"
psql @H -v DB_API_SCHEMA_NAME=api -v DB_DRONE_MAPPING_USER=postgres -f db/migrations/platform/049-version.sql
psql @H -v DB_API_SCHEMA_NAME=api -v DB_DRONE_MAPPING_USER=postgres -f db/migrations/platform/050-initial_platform_schema.sql
```

## 2. Ключи для API

`ACCESS_TOKEN_PRIVATE_KEY` — это base64 от PKCS#8 PEM Ed25519-ключа (см. `config.go`).

```powershell
openssl genpkey -algorithm ed25519 -out ed25519.pem
$PKB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("ed25519.pem"))   # → ACCESS_TOKEN_PRIVATE_KEY
go run ./apps/api/cmd/api gen-secret-key                                       # → SECRET_TINK_KEYSET_JSON
```

Заполни `apps/api/.env` из `.env.sample`: `DATABASE_URI` (localhost), `ACCESS_TOKEN_PRIVATE_KEY`, `SECRET_TINK_KEYSET_JSON`.

Запуск: `go run ./apps/api/cmd/api server`. Публичные ручки `/ping`, `/health`, `/plans` работают сразу.

## 3. Обход auth для защищённых ручек

Мутации зовут `SELECT auth.is_live_session($1,$2)` — функции нет в миграциях. Заглушка:

```powershell
psql @H -c "CREATE SCHEMA IF NOT EXISTS auth;"
psql @H -c "CREATE OR REPLACE FUNCTION auth.is_live_session(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT true';"
```

Токен выпускай командой `api gen-dev-token` — она подписывает тем же ключом, что проверяет сервер, и берёт `issuer/audience/kid` из тех же env:

```powershell
# в docker-стенде (ключ лежит в томе keys):
docker compose -f docker-compose.dev.yml exec api /app/api gen-dev-token -sub 11111111-1111-1111-1111-111111111111
# локально (ключ в env/файле):
go run ./apps/api/cmd/api gen-dev-token
```

Флаги: `-sub <uuid>` (зафиксировать пользователя), `-ttl 24h`, `-kind user`. Токен — в stdout, `subject_id` — в stderr.

Ручные требования к токену (если подписываешь иначе): header `alg=EdDSA`/`kid=ed25519-v1`/`typ=access+jwt`; claims `iss=auth.local`, `aud=api.local`, `sub`, `sid`, `sk=user`, `jti`, `exp`.

Перед созданием проекта вызови `POST /account/initialize` (привязывает account-план). В docker-стенде планы и ключ шифрования уже засеяны `dev-setup.sql`; при ручном запуске засей `plans` (`free_account`/`free_project`) и активный `encryption_keys`.

## 4. Остальное

```powershell
# proxy-ql-executor (порт переопредели — API тоже на 8080)
cd apps/proxy-ql-executor; $env:API_ENDPOINT="http://localhost:8080"; $env:LOCAL_HTTP_ADDR="8070"; go run -tags dev .
# drones GC (одна итерация)
cd apps/drones; $env:DATABASE_URI="postgres://postgres:postgres@localhost:5432/platform"; go run . gc --once
```

## Заметки

- `go build` без `-o` кладёт `.exe` в текущую папку — используй `go run` или `-o bin/`, мусор удаляй.
- Docker и применение миграций к БД — только с согласия пользователя.
