# Sb0rka — инструкции для кодовых агентов

Управляемая инфраструктура для сервисов, данных и AI-агентов. Go-монорепо (`go.work`) + React-консоль.

Карта и потоки — [ARCHITECTURE.md](ARCHITECTURE.md). Схема БД — [db/SCHEMA.md](db/SCHEMA.md). Сборка/линтер/локальный запуск — [CONTRIBUTING.md](CONTRIBUTING.md). Контракт API — Swagger UI на `/swagger` (генерируется из кода).

## Карта репозитория

| Путь | Что это | Стек |
| --- | --- | --- |
| `apps/api` | Platform API — ядро | Go, net/http |
| `apps/auth` | Auth API | Go, net/http |
| `apps/console` | веб-консоль | React, Vite, TS |
| `apps/s0c` | CLI | Go, cobra |
| `apps/drones` | фоновые задачи | Go |
| `apps/proxy-ql-executor` | serverless SQL-исполнитель | Go |
| `packages/contract` | общие DTO (api ↔ s0c) | Go |
| `db/migrations/platform` | миграции БД | SQL (psql) |

## Конвенции

- **Go (`apps/api`)** — строгая слоистость `transport/ → service/ → store/db/ → domain/model/`, зависимости через интерфейсы. Единственная дверь к БД — интерфейс `store/db.Database`. Ошибки — sentinel-значения + `errors.Is` в хендлерах. DTO — в `packages/contract`. Логирование — `log/slog`, без plaintext секретов.
- **React (`apps/console`)** — feature-based (`src/features/<feature>/`), данные через TanStack Query, HTTP через `src/lib/api-client.ts`, тексты через i18next (ru+en).
- **Миграции** — `NNN-name.sql`, psql-переменные `:"DB_API_SCHEMA_NAME"` (схема `api`), обновление `version_platform`. Меняешь схему — правь модели/стор/`contract` и `db/SCHEMA.md`.
- **Эндпоинты** документируются swaggo-аннотациями над хендлером (`swag init`), не markdown.

## Инварианты безопасности

- `proxy-ql-executor`: ноль состояния в глобалах; каждый вызов резолвит URI БД по токену, создаёт и закрывает своё соединение.
- Секреты: Tink AEAD с AAD (`project/secret/version/class`) — AAD при шифровании и расшифровке совпадает. Reveal — с `Cache-Control: no-store`. Plaintext секретов не логировать.
- RBAC — deny-by-default (`authz/`).

## Рабочие правила

- **Тесты не писать и не запускать** (на стадии альфа-версии осознанно не пишутся).
- **Docker не запускать** без явного запроса.
- Комментарии — про «почему», не пересказ кода.
- Коммиты — conventional commits; на ветке `main` сначала создавай ветку.
- Полный прод-сценарий локально не поднимается (нет оркестратора) — детали в `CONTRIBUTING.md`.

---

> Блок ниже — инструкции GitNexus, **актуальны только если доступен GitNexus MCP** (инструменты `gitnexus_*`). Без GitNexus игнорируй их.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **sb0rka** (4069 symbols, 10117 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/sb0rka/context` | Codebase overview, check index freshness |
| `gitnexus://repo/sb0rka/clusters` | All functional areas |
| `gitnexus://repo/sb0rka/processes` | All execution flows |
| `gitnexus://repo/sb0rka/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
