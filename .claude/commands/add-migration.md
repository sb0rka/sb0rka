---
description: Создать новую SQL-миграцию платформы по конвенциям проекта
argument-hint: <что меняем в схеме, например: добавить таблицу api_keys>
---

Создай миграцию для: `$ARGUMENTS`.

Делегируй задачу субагенту `migration-author` — он знает конвенции (нумерация `NNN-name.sql`, psql-переменные `:"DB_API_SCHEMA_NAME"`/`:"DB_DRONE_MAPPING_USER"`, схема `api`, обновление `version_platform`, именование ограничений, триггеры `set_updated_at`).

После создания миграции обнови `db/SCHEMA.md` (диаграмма + описание таблиц) и проверь, нужно ли синхронно обновить:
- модели `apps/api/internal/domain/model`,
- интерфейс и реализацию `apps/api/internal/store/db`,
- DTO `packages/contract`,
- `apps/api/docs/reference.md` (+`_en`), если затронут публичный контракт.

Миграцию против БД не применяй без явного запроса.
