BEGIN;

SET LOCAL search_path = :"DB_API_SCHEMA_NAME", pg_temp;

INSERT INTO plans (name, description, code, kind, is_public, is_available)
VALUES
    ('Community Account', 'Unlimited local account', 'community_account', 'account', true, true),
    ('Community Project', 'Unlimited local project', 'community_project', 'project', true, true)
ON CONFLICT (code) DO NOTHING;

COMMIT;
