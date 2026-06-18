---
description: Прогнать ревью Go-изменений агентом go-api-reviewer
argument-hint: [путь/домен, по умолчанию — git-дифф]
---

Сделай ревью Go-кода${ARGUMENTS:+ ($ARGUMENTS)}.

1. Собери контекст изменений: `git diff` (или `git diff main...HEAD`), либо файлы по `$ARGUMENTS`.
2. Делегируй субагенту `go-api-reviewer` — он проверяет слоистость (`transport→service→store→model`), sentinel-ошибки + `errors.Is`, маппинг в `contract`, RBAC (`authz.Action` в матрице), инварианты безопасности (plaintext в логах, reveal `no-store`, AAD, ноль состояния в proxy), конфиг-параметры.
3. Передай агенту список изменённых файлов и diff.

Выведи находки агента: `файл:строка`, серьёзность (blocker/warning/nit), проблема, как чинить. Тесты предлагать не нужно.
