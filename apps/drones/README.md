# drones

Фоновый сборщик мусора платформы Sb0rka.

Русский | [English](README_EN.md)

Удаляет терминированные базы данных и связанные с ними password-секреты: по тикеру вызывает SQL-функцию `api.cleanup_one_deleted_dbi()`, которая по одной зачищает базы, у которых и БД, и секрет в состоянии `deleted`, а пароль помечен `absent`. См. поток в [`apps/api/docs/architecture.md`](../api/docs/architecture.md).

## Запуск

```bash
# одна итерация и выход:
go run ./apps/drones gc --once

# по интервалу:
go run ./apps/drones gc --interval 5s
```

Сборка: `go build -o bin/drones ./apps/drones`.

## Команды

| Команда | Назначение |
| --- | --- |
| `gc` | Запуск сборки мусора (флаги `--once`, `--interval`) |
| `version` | Печать версии |

## Конфигурация (env)

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `DATABASE_URI` | `postgres://postgres:postgres@localhost:5432/platform` | строка подключения к платформенной БД |
| `DATABASE_MAX_OPEN_CONNS` | `10` | размер пула соединений |
| `DATABASE_CONN_MAX_LIFETIME_SEC` | `30` | время жизни соединения, сек |
| `GC_INTERVAL_SEC` | `5` | интервал GC, сек (если не задан флаг `--interval`) |
