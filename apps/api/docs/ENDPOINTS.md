# Эндпоинты

JWT от auth-api используется только как identity token (`sub`, `sid`, `sk`, `jti`).  
Авторизация в Platform API всегда проверяется по явным связям в `api.project_members`.

v0.1.0-ограничения:

- поддерживается только `sub`, который ссылается на `auth.subjects.kind = 'user'`
- contextual/delegated acting-as flow не поддерживается
- `sk` используется только для capability gating, не для выдачи прав

## Сервис

- `GET /ping` - Проверка доступности API. Аутентификация: нет.
- `GET /health` - Проверка состояния сервиса. Аутентификация: нет.

## Планы и квоты

- `GET /plans` - Список публичных планов (`is_public = true`, `is_available = true`) с `kind = account|project`. Аутентификация: нет.
- `GET /account/plan` - Текущий account plan для `subject_id` (`api.subject_plans`). **Аутентификация: да**.
- `GET /projects/{project_id}/plan` - Текущий project plan (`api.projects.plan_id`). **Аутентификация: да, `project.read`**.
- `GET /projects/{project_id}/quotas` - Эффективные лимиты проекта. **Аутентификация: да, `project.read`**.
- `GET /projects/{project_id}/usage` - Текущее потребление лимитов проекта. **Аутентификация: да, `project.read`**.

## Проекты

- `GET /projects` - Список проектов, где текущий subject является member. **Аутентификация: да**.
- `POST /projects` - Создание проекта. **Аутентификация: да + live session**. Аргументы: `name`, `description`. В v0.1.0 `billing_subject_id = current subject_id`. Присваивается `free` план.
- `GET /projects/{project_id}` - Получение проекта. **Аутентификация: да, `project.read`**.
- `PATCH /projects/{project_id}` - Обновление метаданных проекта. **Аутентификация: да, `project.update_meta` + live session**.
- `DELETE /projects/{project_id}` - Удаление проекта. **Аутентификация: да, `project.delete` + live session**.

## Участники проекта

- `GET /projects/{project_id}/members` - Список участников проекта. **Аутентификация: да, `project.member.list`**.
- `POST /projects/{project_id}/members` - Добавление участника. **Аутентификация: да, `project.member.add` + live session**. Аргументы: `subject_id`, `role`. В v0.1.0 target subject должен быть `kind=user`.
- `GET /projects/{project_id}/members/{subject_id}` - Получение участника. **Аутентификация: да, `project.member.read`**.
- `PATCH /projects/{project_id}/members/{subject_id}` - Изменение роли участника. **Аутентификация: да, `project.member.update` + live session**.
- `DELETE /projects/{project_id}/members/{subject_id}` - Удаление участника. **Аутентификация: да, `project.member.remove` + live session**.

## Ресурсы

- `GET /projects/{project_id}/resources` - Список ресурсов проекта. **Аутентификация: да, `project.read`**.

## Инстансы баз данных

- `POST /projects/{project_id}/dbi` - Создание БД инстанса (и системного password secret). **Аутентификация: да, `db.create` + live session**.
- `GET /projects/{project_id}/dbis` - Список БД инстансов проекта. **Аутентификация: да, `db.list`**.
- `GET /projects/{project_id}/resources/{resource_id}/dbi` - Получение БД инстанса. **Аутентификация: да, `db.read`**.
- `PATCH /projects/{project_id}/resources/{resource_id}/dbi` - Обновление метаданных БД инстанса. **Аутентификация: да, `db.update_meta` + live session**.
- `POST /projects/{project_id}/resources/{resource_id}/dbi/state/start` - Запуск БД инстанса. **Аутентификация: да, `db.start` + live session**.
- `POST /projects/{project_id}/resources/{resource_id}/dbi/state/stop` - Остановка БД инстанса. **Аутентификация: да, `db.stop` + live session**.
- `GET /projects/{project_id}/resources/{resource_id}/dbi/connection/direct` - Параметры подключения (без plaintext секрета). **Аутентификация: да, `db.connection_info.read`**.
- `POST /projects/{project_id}/resources/{resource_id}/dbi/uri/direct/reveal` - Reveal полного URI подключения. **Аутентификация: да, `db.connection_info.read` + `secret.reveal` для password secret + live session**. Ответ должен иметь `Cache-Control: no-store`, `Pragma: no-cache`.
- `DELETE /projects/{project_id}/resources/{resource_id}/dbi` - Удаление БД инстанса. **Аутентификация: да, `db.delete` + live session**.

## Телеметрия

- `GET /projects/{project_id}/resources/{resource_id}/observability/metrics/timeseries?metric=` - Ресурс-уровневая временная серия метрики БД за фиксированный диапазон `24h` с шагом `5m`. **Аутентификация: да, `db.read`**. Допустимые `metric`: `active_connections`, `db_size_rate`, `db_size`, `net_receive`, `net_transmit`.

## Секреты

- `POST /projects/{project_id}/secret` - Создание секрета. **Аутентификация: да, `secret.create` + live session**.
- `GET /projects/{project_id}/secrets` - Список секретов (metadata). Аутентификация: да, `secret.list`.
- `GET /projects/{project_id}/resources/{resource_id}/secret` - Получение metadata секрета. **Аутентификация: да, `secret.read_meta`**.
- `POST /projects/{project_id}/resources/{resource_id}/secret/reveal` - Reveal plaintext значения секрета. **Аутентификация: да, `secret.reveal` + live session**.  
  Ответ должен иметь `Cache-Control: no-store`, `Pragma: no-cache`, plaintext не должен попадать в логи.
- `PATCH /projects/{project_id}/resources/{resource_id}/secret` - Обновление metadata секрета. **Аутентификация: да, `secret.update_meta` + live session**. Аргументы: `description`.
- `GET /projects/{project_id}/resources/{resource_id}/secret/versions` - Список версий секрета без plaintext. **Аутентификация: да, `secret.version.list`**.
- `GET /projects/{project_id}/resources/{resource_id}/secret/versions/{version_no}` - Metadata конкретной версии секрета. **Аутентификация: да, `secret.version.read`**.
- `POST /projects/{project_id}/resources/{resource_id}/secret/versions` - Создание новой immutable value version. **Аутентификация: да, `secret.version.create` + live session**.
- `POST /projects/{project_id}/resources/{resource_id}/secret/versions/{version_no}/reveal` - Reveal plaintext конкретной версии. **Аутентификация: да, `secret.reveal` + live session**. Ответ должен иметь `Cache-Control: no-store`, `Pragma: no-cache`.
- `POST /projects/{project_id}/resources/{resource_id}/secret/versions/{version_no}/verifier/apply` - Назначить эту **активную** версию секрета паролем БД. **Аутентификация: да, `secret.reveal` + live session**.
- `POST /projects/{project_id}/resources/{resource_id}/secret/versions/{version_no}/disable` - Отключение версии секрета. **Аутентификация: да, `secret.version.disable` + live session**.
- `DELETE /projects/{project_id}/resources/{resource_id}/secret` - Удаление секрета. **Аутентификация: да, `secret.delete` + live session**.

## Тэги

- `GET /projects/{project_id}/tags` - Список тэгов проекта. **Аутентификация: да, `tag.list`**.
- `GET /projects/{project_id}/resources/{resource_id}/tags` - Список тэгов ресурса. **Аутентификация: да, `tag.list`**.
- `POST /projects/{project_id}/resources/{resource_id}/tag` - Привязка/создание тэга у ресурса. **Аутентификация: да, `resource.tag.attach` + live session**.
- `DELETE /projects/{project_id}/resources/{resource_id}/tags/{tag_id}/detach` - Отвязка тэга от ресурса. **Аутентификация: да, `resource.tag.detach` + live session**.
