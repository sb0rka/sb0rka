---
description: Перегенерировать OpenAPI-спеку Platform API из swaggo-аннотаций
---

Регенерируй swagger-спеку `apps/api`:

```
cd apps/api && go run github.com/swaggo/swag/cmd/swag init -g cmd/api/main.go --output internal/openapi --parseDependency --parseInternal
```

`--parseDependency` нужен, чтобы подтянуть схемы из `packages/contract`. После генерации:

- проверь, что команда завершилась без ошибок (swaggo падает на некорректных аннотациях);
- `apps/api/internal/openapi/` (docs.go + swagger.json/yaml) **коммитится** — `docs.go` нужен компилятору (blank-import в `main.go`);
- при желании проверь результат: подними API и открой `/swagger/index.html`.

Если добавлял новый домен — убедись, что хендлеры проаннотированы (`// @Router`, `// @Summary` и т.д.), иначе они не попадут в спеку.
