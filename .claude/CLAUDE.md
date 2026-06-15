# Sb0rka — инструкции для Claude

Управляемая инфраструктура: PostgreSQL как сервис, зашифрованные секреты, телеметрия.
Go-монорепо (`go.work`) + React-консоль. Публичная дока — в `docs/`; справочник Platform API — в `apps/api/docs/`. **Перед работой с `apps/api` прочитай [`apps/api/docs/architecture.md`](../apps/api/docs/architecture.md)** (слои, потоки) и [`db/SCHEMA.md`](../db/SCHEMA.md) (структура БД).

## Карта репозитория

| Путь | Что это | Стек |
| --- | --- | --- |
| `apps/api` | Platform API — ядро | Go, net/http |
| `apps/auth` | Auth API (JWT, refresh, RBAC) |
| `apps/console` | веб-консоль | React 18, Vite, TS, Tailwind |
| `apps/s0c` | CLI | Go, cobra |
| `apps/drones` | фоновые задачи | Go |
| `apps/proxy-ql-executor` | serverless-исполнитель SQL | Go |
| `packages/contract` | общие DTO для api и s0c | Go |
| `db/migrations/platform` | миграции БД | SQL (psql) |
| `docs` | публичная дока (синкается в docs-site) | Markdown (ru+en) |

## Рабочее окружение

- Go 1.25+ (workspace из 4 модулей). Команды запускай **из корня репо**.
- Запуск сервиса: `go run ./apps/api/cmd/api server`. Сборка: `go build -o bin/<name> ./...` — **не оставляй `.exe`/бинари в корне** (`go build` без `-o` кладёт их в cwd).
- Полный прод-сценарий локально невозможен: реальные tenant-инстансы БД поднимает оркестратор (не в репо). Локальный стенд (Postgres + auth + api + drones + proxy) — в `.claude/skills/local-dev`.

## Go: конвенции

- **Слоистость `apps/api`** строгая, не смешивать: `transport/` (HTTP) → `service/` (бизнес-логика, валидация) → `store/db/` (pgx) → `domain/model/`. Зависимости — через интерфейсы (`Database`, `Authorizer`, `SecretCrypto`), которые прокидываются в `runtime.Dependencies`.
- **Единственная дверь к БД** — интерфейс `store/db.Database`. Новый запрос = метод интерфейса + реализация в `psql.go`.
- **Ошибки** — типизированные sentinel-значения в `store/db/errors.go`, хендлеры матчат через `errors.Is` и переводят в HTTP-коды. Не возвращай голые строки из стора.
- **DTO** запросов/ответов API живут в `packages/contract` (общие для api и s0c) — это единственный источник правды для JSON-форматов. Маппинг `model → contract` делается в хендлере функциями `toX`.
- **Эндпоинты документируются swaggo-аннотациями** над хендлером (`// @Summary`, `// @Param`, `// @Router` …); схемы тел берутся из `packages/contract` автоматически. После добавления/изменения ручки — регенерируй спеку (`/regen-swagger`). UI на `/swagger`. Рукописные markdown-доки эндпоинтов **не ведём**. Сгенерированный пакет `apps/api/internal/openapi/` **коммитится** (нужен компилятору).
- Логирование — `log/slog`, структурно (`key, value`). **Никогда не логируй plaintext секретов/паролей/URI с паролем.**
- Конфиг — из env через хелперы в `config.go`. Новый параметр = поле в `schema.go` + чтение в `Load()` + строка в `.env.sample`.

## React/TS: конвенции (`apps/console`)

- Структура **feature-based**: `src/features/<feature>/` (api.ts, hooks.ts, компоненты). Общий UI — `src/components/ui` (Radix + cva).
- Данные с сервера — только через **TanStack Query** (`src/lib/query-client.ts`), не голый fetch в компонентах.
- HTTP — через `src/lib/api-client.ts` (он знает про 4 базовых URL и refresh токена). Новые вызовы добавляй туда, не дублируй базовые адреса.
- Любой пользовательский текст — через **i18next** (`src/lib/i18n.ts`), ru и en сразу.

## Миграции БД

- Файлы нумерованные: `NNN-name.sql` в `db/migrations/platform/`, применяются по порядку.
- Используют psql-переменные `:"DB_API_SCHEMA_NAME"` (схема платформы — `api`) и `:"DB_DRONE_MAPPING_USER"`. Запросы кода идут без префикса схемы → полагаются на `search_path`. **Не хардкодь имя схемы.**
- Каждая миграция обновляет `version_platform`. Меняешь схему — синхронно правь модели (`domain/model`), стор и `contract`.
- **Меняешь схему — обнови `db/SCHEMA.md`** (ER-диаграмма + описание таблиц). Это источник правды по структуре БД.

## Docs

- `docs/` синкается целиком в репозиторий `sb0rka/docs-site` (rsync, см. `.github/workflows/sync-docs-site.yml`). Навигация сайта — **там**, в этом репо её нет.
- Каждый документ — **парный**: `name.md` (ru) и `name_en.md` (en). Меняешь один — меняй оба.
- Формат — Mintlify: frontmatter `title` + `description`. Стиль — пользовательский, понятный.

## Критические инварианты безопасности

Не нарушать без явного запроса:

- **`proxy-ql-executor`**: ноль состояния в глобалах. Каждый вызов заново резолвит URI БД по bearer-токену, создаёт своё соединение и закрывает его. SQL по умолчанию read-only.
- **Шифрование секретов**: AEAD c AAD, привязанным к `project/secret/version/class` (`service/secret_crypto.go`). AAD при шифровании и расшифровке должен совпадать.
- **RBAC**: deny-by-default (`authz/`). Новое действие = константа `Action` + запись в матрице `rbac.go` для нужных ролей. Бизнес-инварианты (последний owner и т.п.) — в хендлере поверх RBAC.
- **Reveal-эндпоинты**: ответ с `Cache-Control: no-store`, plaintext не в логах.
- В платформенной БД пароль БД хранится только зашифрованным + как SCRAM-verifier, не в открытом виде.

## Рабочие правила

- **Тесты не писать и не запускать**, если явно не попросили (в проекте их нет осознанно).
- **Docker не запускать** без явного запроса.
- Комментарии — только про «почему», не про «что». Без нейрослопа, без пересказа имён функций.
- Коммиты — conventional commits, сообщение про «почему». На ветке `main` сначала создавай ветку.
- Меняешь эндпоинт/контракт — проаннотируй хендлер swaggo-комментариями и регенерируй спеку (`/regen-swagger`), не правь markdown вручную.
