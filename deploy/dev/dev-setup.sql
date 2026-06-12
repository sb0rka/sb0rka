-- Локальная dev-инициализация. НЕ для прода.
-- Запускается migrate.sh после миграций.

-- Заглушка проверки живой сессии: в проде её предоставляет auth-сервис,
-- которого нет в этом репозитории. Без неё все мутации API возвращают 401.
CREATE OR REPLACE FUNCTION auth.is_live_session(uuid, uuid)
RETURNS boolean LANGUAGE sql AS 'SELECT true';

-- Планы. Квоты не задаём — отсутствие квоты трактуется как безлимит,
-- поэтому в dev можно создавать сколько угодно проектов/баз/секретов.
INSERT INTO api.plans (name, code, kind, is_public, is_available)
VALUES ('Free Account', 'free_account', 'account', true, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO api.plans (name, code, kind, is_public, is_available)
VALUES ('Free Project', 'free_project', 'project', true, true)
ON CONFLICT (code) DO NOTHING;

-- Активный ключ шифрования. key_ref должен совпадать с SECRET_KEY_REF (=default),
-- иначе создание базы данных падает на этапе шифрования пароля.
INSERT INTO api.encryption_keys (provider, key_ref, algorithm, status)
SELECT 'tink_aead', 'default', 'AES256_GCM', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM api.encryption_keys WHERE provider = 'tink_aead' AND status = 'active'
);
