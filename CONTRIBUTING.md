# Contributing

Спасибо, что вкладываетесь в Sb0rka! Этот файл — про то, как собрать, проверить и запустить проект.

Архитектура — [ARCHITECTURE.md](ARCHITECTURE.md). Схема БД — [db/SCHEMA.md](db/SCHEMA.md). Контракт API — Swagger UI на `/swagger`.

## Окружение

- **Go 1.25+** (workspace из нескольких модулей; `drones` — отдельный модуль вне `go.work`).
- **Node 18+** — для `apps/console`.
- **Docker** — для локального стенда.

## Инструменты (опциональны, но удобны)

| Инструмент | Зачем | Установка (Windows) |
| --- | --- | --- |
| [Task](https://taskfile.dev) (`go-task`) | task-runner, короткие команды вместо длинных (см. `Taskfile.yml`) | `winget install Task.Task` |
| [golangci-lint](https://golangci-lint.run) | линтер Go (конфиг — `.golangci.yml`) | `winget install golangci-lint` |
| [swag](https://github.com/swaggo/swag) | генерация OpenAPI-спеки | тянется через `go run`, ставить не нужно |

Без Task проект собирается обычным `go build` — Taskfile лишь собирает рутинные команды под короткими именами.

## Типовые команды

Через Task (из корня репо):

```bash
task --list      # список всех задач с описаниями
task build       # собрать все Go-сервисы в bin/
task fmt         # gofmt по всем модулям
task lint        # golangci-lint
task tidy        # go mod tidy во всех модулях
task swagger     # перегенерировать OpenAPI-спеку (после правок swaggo-аннотаций)
task dev         # поднять локальный стенд (docker-compose)
task dev-down    # погасить стенд
```

Без Task — те же команды напрямую, например: `go build -o bin/api ./apps/api/cmd/api`. Линтер запускают помодульно (из-за `go.work`): `cd apps/api && golangci-lint run ./...` — и так по каждому модулю.

## Локальный запуск

Полный прод-сценарий локально невозможен (нет auth-сервиса, nl2sql и оркестратора инстансов). Стенд из репо (Postgres + api + drones + proxy):

```bash
task dev    # или: docker compose -f docker-compose.dev.yml up -d --build
```

Доступ к API — по Bearer-JWT. Локально токен выпускается командой:

```bash
docker compose -f docker-compose.dev.yml exec api /app/api gen-dev-token -sub 11111111-1111-1111-1111-111111111111
```

Дальше: Swagger UI — http://localhost:8080/swagger/index.html (кнопка **Authorize** → `Bearer <токен>`). Подробности и happy-path — в `.claude/skills/local-dev/SKILL.md`.

## Конвенции

- **Эндпоинты** документируются swaggo-аннотациями над хендлером (`task swagger` для регенерации), не вручную в markdown.
- **Меняете схему БД** — обновите модели, стор, `packages/contract` и `db/SCHEMA.md`.
- **Документация** парная: `name.md` (ru) + `name_en.md` (en).
- **Коммиты** — conventional commits, сообщение про «почему».
