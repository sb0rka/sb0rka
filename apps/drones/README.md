# drones

Фоновые задачи Sb0rka.

Русский | [English](README_EN.md)

Задачи:
- Удаляет терминированные базы данных и связанные с ними password-секреты: по тикеру вызывает SQL-функцию `api.cleanup_one_deleted_dbi()`, которая по одной зачищает базы, у которых и БД, и секрет в состоянии `deleted`, а пароль помечен `absent`.

## Использование

Сборка: `go build -o bin/drones ./apps/drones`.

```bash
# одна итерация и выход:
go run ./apps/drones gc --once

# по интервалу:
go run ./apps/drones gc --interval 5s
```
