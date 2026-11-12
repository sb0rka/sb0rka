BEGIN;

SET LOCAL search_path = :"DB_API_SCHEMA_NAME", pg_temp;

-- Only key metadata is stored here; key_ref must match SECRET_KEY_REF.
INSERT INTO encryption_keys (
    provider, 
    purpose,
    key_ref, 
    algorithm, 
    status
)
VALUES (
    'tink_aead', 
    'resource_secret',
    'default', 
    'AES256_GCM', 
    'active'
)
ON CONFLICT DO NOTHING;

COMMIT;
