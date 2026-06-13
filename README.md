![sborka](docs/imgs/logo.png)

Sb0rka — управляемая инфраструктура для сервисов, данных и AI-агентов.

Быстрый запуск PostgreSQL, безопасная работа с секретами и встроенная телеметрия в единой среде.

Русский | [English](README_EN.md)

---

[Сайт](https://sb0rka.ru) | [Документация](https://docs.sb0rka.com/ru) | [s0c CLI](apps/s0c)

Архитектура системы — [ARCHITECTURE.md](ARCHITECTURE.md). Схема БД — [db/SCHEMA.md](db/SCHEMA.md). Сборка, линтер, локальный запуск — [CONTRIBUTING.md](CONTRIBUTING.md).

## Состав репозитория

- `apps/api`: HTTP API сервис
- `apps/console`: веб-консоль платформы
- `apps/s0c`: CLI инструмент
- `db/migrations/platform`: миграции базы данных платформы (схема и ER-диаграмма — в [`db/SCHEMA.md`](db/SCHEMA.md))
- `docs`: Документация проекта
- `packages/contract`: request/response DTO общий для API и CLI
