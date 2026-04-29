CREATE TABLE IF NOT EXISTS core.version_platform (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT version_platform_pkc PRIMARY KEY (version_num)
);
