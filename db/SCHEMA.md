# Схема БД

Базовая схема API: [010-initial_api_schema.sql](migrations/platform/010-initial_api_schema.sql).

## Ключи шифрования

`encryption_keys` хранит метаданные ключей: `provider`, `purpose`, `key_ref`,
`algorithm`, `status`. Назначение ресурсного ключа — `resource_secret`.
Материал Tink keyset хранится вне БД.

Активный ключ выбирается по назначению, provider, алгоритму и настроенному
`SECRET_KEY_REF`. Для каждой пары `(provider, purpose)` разрешен один активный
ключ. Исторические материалы секрета ссылаются на ключ по `encryption_key_id`.
