---
name: local-dev
description: Как поднять локальный стенд Sb0rka (docker-compose: Postgres, auth, api, drones, proxy) и получить access-токен через auth (регистрация + логин). Используй для запуска проекта на машине, отладки API и получения dev-токена.
---

# Локальный запуск Sb0rka

## Что поднимается

Стенд `docker-compose.dev.yml`: Postgres + миграции (схемы `api` и `auth` в одной БД) + `auth` (:8020) + `api` (:8080) + `drones` + `proxy-ql-executor` (:8070).

Не поднимается: реальные tenant-инстансы PostgreSQL — их создаёт оркестратор, которого нет в репозитории. Поэтому `proxy /query` до созданной базы не достучится (метаданные есть, живой базы нет).

## Запуск (одна команда)

```bash
docker compose -f docker-compose.dev.yml up -d --build   # или: task dev
```

Порядок: `postgres` → `keygen` (Ed25519 + Tink ключи в том `keys`) → `migrate` (схемы `api`+`auth`, миграции, планы и ключ шифрования) → `auth`/`api`/`drones`/`proxy`.

Проверка: `curl http://localhost:8080/health`; Swagger UI — http://localhost:8080/swagger/index.html.

## Получить токен (через auth)

`auth` подписывает JWT тем же Ed25519-ключом, что `api` проверяет (общий том `keys`). Регистрируемся и логинимся (invite/phone в dev не требуются):

```bash
# 1. регистрация пользователя
curl -s -X POST http://localhost:8020/identity/users \
  -H 'Content-Type: application/json' \
  -d '{"username":"dev","email":"dev@local","password":"devpass123"}'

# 2. логин → access_token
curl -s -X POST http://localhost:8020/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"dev","password":"devpass123"}'
# → {"access_token":"<JWT>"}
```

Токен передавай в `Authorization: Bearer <JWT>` — в Swagger UI (кнопка **Authorize**) или в curl к `api`.

## Happy path

```bash
TOKEN=<JWT>
# привязать account-план (планы засеяны dev-setup.sql)
curl -X POST http://localhost:8080/account/initialize -H "Authorization: Bearer $TOKEN"
# создать проект
curl -X POST http://localhost:8080/projects -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"test"}'
# создать базу (создаётся зашифрованный password-секрет)
curl -X POST http://localhost:8080/projects/<project_id>/dbi -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"testdb","desired_runtime_state":"running"}'
```

## Заметки

- `api` и `auth` делят одну БД `platform` (схемы `api` и `auth`, `search_path=api,auth,public`); `api` зовёт `auth.is_live_session` в схеме `auth`.
- Реальные tenant-инстансы не поднимаются (нет оркестратора) — `proxy /query` до tenant-БД не достучится.
- Docker и применение миграций к БД — только с согласия пользователя.
- `go build` без `-o` кладёт `.exe` в cwd — используй `go run` или `-o bin/`, мусор удаляй.
