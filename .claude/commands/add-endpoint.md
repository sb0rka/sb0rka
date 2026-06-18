---
description: Добавить новый REST-эндпоинт в Platform API полным вертикальным срезом
argument-hint: <метод и путь, например: POST /projects/{project_id}/dbi/restore>
---

Добавь эндпоинт `$ARGUMENTS` в `apps/api`, пройдя все слои по порядку. Сначала прочитай существующий аналогичный эндпоинт целиком (handler + метод стора), чтобы повторить паттерн.

Чеклист вертикального среза:

1. **Контракт** (`packages/contract`): добавь request/response DTO, если нужны новые формы. JSON-теги в snake_case.
2. **Стор** (`apps/api/internal/store/db`): объяви метод в интерфейсе `Database` (`db.go`), реализуй в `psql.go`. Многотабличные операции — в транзакции. Новые ошибки — sentinel в `errors.go`.
3. **Сервис** (`apps/api/internal/service`): валидация/нормализация входа, если требуется (имена, лимиты).
4. **RBAC** (`apps/api/internal/authz`): если действие новое — добавь константу `Action` в `authorizer.go` и пропиши её в матрице `rbac.go` для нужных ролей.
5. **Хендлер** (`apps/api/internal/transport/<domain>`): извлеки identity, проверь `Authorizer.Authorize`, провалидируй вход, вызови стор, замапь `model → contract` через `toX`. Ошибки стора матчи через `errors.Is` в корректные HTTP-коды.
6. **swaggo-аннотации** над хендлером (`// @Summary`, `// @Tags`, `// @Param`, `// @Success {object} contract.X`, `// @Failure`, `// @Security BearerAuth`, `// @Router <путь> [метод]`) — по образцу соседних хендлеров. Схемы тел подтянутся из `contract` автоматически.
7. **Роутер** (`apps/api/internal/transport/router.go`): зарегистрируй путь. Мутация → `authLive`, чтение → `authOnly`.
8. **Регенерируй спеку**: `/regen-swagger` (или `cd apps/api && go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go --output internal/openapi --parseDependency --parseInternal`). Закоммить `internal/openapi/`.

Соблюдай инварианты безопасности из `.claude/CLAUDE.md` (reveal → `no-store`, без plaintext в логах, AAD для секретов). Тесты не пиши. В конце прогони `go build ./apps/api/cmd/api` (с `-o bin/...` или `go vet`), чтобы убедиться, что компилируется, и удали временный бинарь.
