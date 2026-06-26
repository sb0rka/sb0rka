---
name: api-architecture
description: Карта Platform API (apps/api) для навигации и внесения изменений — слои, поток запроса, где RBAC/валидация/маппинг, как добавить эндпоинт или запрос к БД. Используй при работе с apps/api: разобраться в коде, добавить/изменить ручку, найти где что лежит.
---

# Навигация и изменения в Platform API

Полное описание потоков — в [`apps/api/docs/architecture.md`](../../../apps/api/docs/architecture.md). Структура БД — [`db/SCHEMA.md`](../../../db/SCHEMA.md). Этот скилл — процедурная карта «куда смотреть и как действовать».

## Куда смотреть в первую очередь

1. `transport/router.go` — карта всех эндпоинтов + их middleware (`authOnly`/`authLive`).
2. `store/db/db.go` — интерфейс `Database`: оглавление всего, что API умеет с данными (не читай весь `psql.go`).
3. `transport/projects/handlers.go` — эталонный домен: скелет любого хендлера.
4. `domain/model/` — структуры данных (маленькие файлы).
5. `authz/rbac.go` — матрица «роль × действие».

## Поток запроса (как слои связаны)

```
router.go → middlewares.go (JWT→context) → <domain>/handlers.go:
  identity (parseSubjectID) → authorize (RBAC) → validate (service) →
  PlatformDatabase.X (store) → errors.Is→HTTP → toX(model)→contract
```
Хендлеры не знают про SQL — только интерфейс `Database`. JSON-форматы — в `packages/contract` (общие с CLI).

## Как добавить эндпоинт

Используй команду `/add-endpoint` — она проводит по всем слоям. Кратко порядок:
`contract` (DTO) → `store/db` (метод интерфейса + реализация в `psql.go` + sentinel-ошибки) → `service` (валидация) → `authz` (новый `Action` + матрица) → `handler` (RBAC + маппинг ошибок + `toX`) → `router.go` (`authLive` для мутаций) → swaggo-аннотации → `/regen-swagger`.

## Как добавить запрос к БД

Только через интерфейс: метод в `store/db/db.go` (`Database`) + реализация в `psql.go`. Многотабличные операции — в одной транзакции (см. `CreateDatabase` как образец). Новые ошибки — sentinel в `store/db/errors.go`, не голые строки.

## Ключевые точки (не сломать)

- **RBAC** deny-by-default: новое действие = `authz.Action` + запись в матрице `rbac.go`.
- **Секреты**: AAD (`BuildSecretAAD`) при шифровании/расшифровке совпадает; plaintext не логируется; reveal → `Cache-Control: no-store`.
- **Конфиг**: новый env = поле в `config/schema.go` + чтение в `Load()` + `.env.sample`.
- **Документация**: эндпоинты — только swaggo-аннотации + `/regen-swagger`, не markdown.

## Локальный запуск и токены

См. скилл `local-dev`: docker-стенд, получение токена через `auth` (регистрация + логин), happy-path.
