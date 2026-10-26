-- Локальная dev-инициализация. НЕ для прода.
-- Запускается сервисом dev-setup после миграций.

-- Активный ключ шифрования. key_ref должен совпадать с SECRET_KEY_REF (=default),
-- иначе создание базы данных падает на этапе шифрования пароля.
INSERT INTO api.encryption_keys (provider, key_ref, algorithm, status)
SELECT 'tink_aead', 'default', 'AES256_GCM', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM api.encryption_keys WHERE provider = 'tink_aead' AND status = 'active'
);
