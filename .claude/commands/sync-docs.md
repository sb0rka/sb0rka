---
description: Проверить парность ru/en в docs/ и соответствие документации коду
argument-hint: [раздел docs, например: api — иначе вся docs/]
---

Проверь документацию в `docs/`${ARGUMENTS:+ (раздел: $ARGUMENTS)}.

Делегируй субагенту `docs-localizer`:

1. Для каждого `name.md` есть парный `name_en.md` (и наоборот). Найди непарные и создай/обнови пару.
2. У всех файлов корректный frontmatter (`title`, `description`).
3. Если раздел документирует API — сверь пути и тела с `apps/api/internal/transport/router.go` и `packages/contract`, поправь расхождения.

Выведи отчёт: что было непарным, что разошлось с кодом, что исправлено.
