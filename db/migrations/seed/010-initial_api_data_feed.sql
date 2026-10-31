BEGIN;

SET LOCAL search_path = :"DB_API_SCHEMA_NAME", pg_temp;

INSERT INTO plans (name_en, name_ru, description_en, description_ru, code, kind, is_public, is_available)
VALUES
    ('Community Account', 'Комьюнити Аккаунт', 'Unlimited local account', 'Комьюнити аккаунт для локальной разработки', 'community_account', 'account', true, true),
    ('Community Project', 'Комьюнити Проект', 'Unlimited local project', 'Комьюнити проект для локальной разработки', 'community_project', 'project', true, true)
ON CONFLICT (code) DO NOTHING;

COMMIT;
