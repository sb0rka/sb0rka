# Схема платформенной БД

Схема платформы — `api` (PostgreSQL). Миграции лежат в [`migrations/platform`](migrations/platform),
применяются по порядку (`NNN-name.sql`) с psql-переменными `:"DB_API_SCHEMA_NAME"` и
`:"DB_DRONE_MAPPING_USER"`. Запросы кода идут без префикса схемы → полагаются на `search_path`.

> При изменении схемы обновляйте этот файл (диаграмму и описания) вместе с миграцией.

## ER-диаграмма

```mermaid
erDiagram
    PLANS ||--o{ SUBJECT_PLANS : "тариф аккаунта"
    PLANS ||--o{ PLAN_QUOTAS : "лимиты плана"
    QUOTA_DEFINITIONS ||--o{ PLAN_QUOTAS : "вид лимита"
    PLANS ||--o{ PROJECTS : "тариф проекта"
    PROJECTS ||--o{ PROJECT_MEMBERS : "участники"
    PROJECTS ||--o{ RESOURCES : "содержит"
    RESOURCES ||--|| RESOURCE_STATES : "runtime-состояние"
    RESOURCES ||--o| DBIS : "если database"
    RESOURCES ||--o| SECRETS : "если secret"
    SECRETS ||--o{ SECRET_VERSIONS : "версии"
    SECRET_VERSIONS ||--|| SECRET_VERSION_MATERIALS : "шифртекст"
    ENCRYPTION_KEYS ||--o{ SECRET_VERSION_MATERIALS : "ключ шифрования"
    DBIS ||--|| DBI_VERIFIERS : "пароль БД"
    SECRETS ||--o{ DBI_VERIFIERS : "password-секрет"
    PROJECTS ||--o{ TAGS : "теги проекта"
    RESOURCES ||--o{ RESOURCE_TAGS : "привязки"
    TAGS ||--o{ RESOURCE_TAGS : "привязки"

    PLANS {
        uuid id PK
        varchar code UK "free_account / free_project"
        varchar kind "account | project"
        bool is_public
        bool is_available
    }
    SUBJECT_PLANS {
        uuid subject_id PK "пользователь = 1 account-план"
        uuid plan_id FK "только kind=account"
    }
    QUOTA_DEFINITIONS {
        uuid id PK
        varchar code UK "projects.count, databases.count..."
        varchar scope "account | project"
        varchar unit "count | bytes | bps"
    }
    PLAN_QUOTAS {
        uuid plan_id PK,FK
        uuid quota_definition_id PK,FK
        bigint limit_value "лимит (>=0)"
    }
    PROJECTS {
        varchar id PK "hex"
        uuid plan_id FK "только kind=project"
        uuid owner_subject_id
        uuid billing_subject_id
        varchar name "UK с owner"
        bool is_active
    }
    PROJECT_MEMBERS {
        varchar project_id PK,FK
        uuid subject_id PK
        varchar role "owner|admin|editor|viewer"
    }
    RESOURCES {
        varchar id PK "hex"
        varchar project_id FK
        varchar kind "database | secret"
    }
    RESOURCE_STATES {
        varchar resource_id PK,FK
        varchar runtime_state "creating..available..deleted|failed"
    }
    DBIS {
        varchar resource_id PK,FK "= база данных"
        varchar engine "postgresql"
        varchar name
        varchar normalized_name "UK в проекте, lowercase"
        varchar desired_runtime_state "running|suspended|terminated"
    }
    ENCRYPTION_KEYS {
        uuid id PK
        varchar provider "tink_aead"
        varchar key_ref "= SECRET_KEY_REF"
        varchar status "active|disabled|destroyed"
    }
    SECRETS {
        varchar resource_id PK,FK "= секрет"
        varchar name "UK в проекте"
        varchar payload_kind "text | json"
        varchar protection_class "server_managed"
        int current_version_no
        uuid created_by_subject_id
        timestamptz scheduled_destroy_at
    }
    SECRET_VERSIONS {
        varchar secret_id PK,FK
        int version_no PK ">0"
        varchar state "active | disabled"
        varchar payload_kind "text|json|binary"
    }
    SECRET_VERSION_MATERIALS {
        varchar secret_id PK,FK
        int version_no PK,FK
        uuid encryption_key_id FK
        varchar crypto_provider "tink_aead"
        jsonb aad_context "привязка project/secret/version/class"
        bytea encrypted_message "шифртекст"
    }
    DBI_VERIFIERS {
        varchar dbi_id PK,FK "= база данных"
        varchar password_secret_id FK
        int password_desired_version
        varchar password_verifier "SCRAM-SHA-256"
        varchar password_desired_state "present | absent"
    }
    TAGS {
        bigint id PK
        varchar project_id FK
        varchar tag_key "UK: project+key+value"
        varchar tag_value
        bool is_system "напр. db_secret"
        bool is_readonly
    }
    RESOURCE_TAGS {
        bigint tag_id PK,FK
        varchar project_id PK
        varchar resource_id PK,FK
    }
```

## Таблицы

### Служебное

- **`version_platform`** — версия применённых миграций (одна строка `version_num`).

### Планы и квоты (биллинг)

- **`plans`** — каталог тарифов. `code` уникален; `kind` = `account` | `project`.
- **`subject_plans`** — account-план пользователя. PK = `subject_id` (один план на пользователя), триггер требует `kind='account'`.
- **`quota_definitions`** — справочник видов лимитов (`code`, `scope`, `unit`).
- **`plan_quotas`** — значения лимитов плана. PK = (`plan_id`, `quota_definition_id`); триггер требует совпадения scope квоты и kind плана. Отсутствие строки = безлимит.

### Проекты

- **`projects`** — контейнер ресурсов. `id` hex; ссылается на project-план; уникальность (`owner_subject_id`, `name`).
- **`project_members`** — участники и роли (`owner`|`admin`|`editor`|`viewer`) — основа RBAC. PK = (`project_id`, `subject_id`).

### Ресурсы

- **`resources`** — общий контейнер; `kind` = `database` | `secret`. Составные уникальности `(id, project_id, kind)` — основа строгих FK у потомков.
- **`resource_states`** — фактическое runtime-состояние (FSM `creating`→`available`→…→`deleted`/`failed`). PK = `resource_id`.
- **`dbis`** — детали инстанса БД (ресурс kind=`database`). `normalized_name` (lowercase) уникален в проекте; `desired_runtime_state` = `running`|`suspended`|`terminated`.

### Секреты и шифрование

- **`encryption_keys`** — метаданные ключей шифрования (не сам материал). Частичный уникальный индекс: один `active`-ключ на провайдера.
- **`secrets`** — секрет (ресурс kind=`secret`). `name` уникален в проекте; `current_version_no`; `payload_kind` = `text`|`json`.
- **`secret_versions`** — immutable версии. PK = (`secret_id`, `version_no`); `state` = `active`|`disabled`.
- **`secret_version_materials`** — зашифрованное значение версии: `encryption_key_id`, `aad_context` (JSONB, привязка к контексту), `encrypted_message` (BYTEA). Envelope-шифрование, разнесённое с метаданными.
- **`dbi_verifiers`** — связка база↔password-секрет в desired-state модели: `password_verifier` (SCRAM-SHA-256), `password_desired_state` = `present`|`absent`. По нему GC понимает, что пароль пора убрать.

### Теги

- **`tags`** — теги проекта (`tag_key`/`tag_value`), уникальность (`project_id`, `tag_key`, `tag_value`). Системный тег `db_secret` связывает базу с её секретом.
- **`resource_tags`** — привязка тегов к ресурсам (M:N). PK = (`project_id`, `resource_id`, `tag_id`).

## Ключевые паттерны

1. **`resources` — единая точка наследования.** База (`dbis`) и секрет (`secrets`) делят `id`+`project_id`+`kind`; составные FK `(id, project_id, kind)` не дают перепутать тип и защищены cross-project mismatch.
2. **Desired vs runtime.** Намерение пишет API (`dbis.desired_runtime_state`, `dbi_verifiers.password_desired_state`), факт отражает реконсилятор (`resource_states.runtime_state`). Расхождение — сигнал фоновым процессам, данные поля редактируются только API, а состояние инфраструктуры отражено в `resource_states` - таблице состояний запрещенной для изменения из API.
3. **Секрет нигде не лежит открыто.** Только зашифрованный материал + SCRAM-verifier; AAD привязывает шифртекст к `project/secret/version/class`.
4. **Связка база↔секрет тройная.** `dbis` ↔ `dbi_verifiers` ↔ `secrets` + системный тег `db_secret`. Эту тройку зачищает GC-дрон при удалении базы (`cleanup_one_deleted_dbi()`).
5. **Биллинг отделён.** Аккаунт-квоты — по `subject_plans`, проектные — по `projects.plan_id`.

У всех таблиц `created_at`/`updated_at` с триггером `set_updated_at` для трекинга изменений.
