CREATE TABLE IF NOT EXISTS :"DB_AUTH_SCHEMA_NAME".version_auth (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT version_auth_pkc PRIMARY KEY (version_num)
);
