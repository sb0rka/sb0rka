CREATE TABLE IF NOT EXISTS :"DB_API_SCHEMA_NAME".version_platform (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT version_platform_pkc PRIMARY KEY (version_num)
);
