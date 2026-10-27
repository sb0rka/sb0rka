-- Migration: 7c1d9e4a6b20

BEGIN;

SET LOCAL search_path = :"DB_AUTH_SCHEMA_NAME", pg_temp;

ALTER TABLE auth_sessions
    ADD COLUMN IF NOT EXISTS oauth_client_id VARCHAR(128);

CREATE INDEX IF NOT EXISTS ix_auth_sess_oauth_client_active
    ON auth_sessions (subject_id, oauth_client_id)
    WHERE oauth_client_id IS NOT NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS oidc_auth_requests (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    client_id VARCHAR(128) NOT NULL,
    redirect_uri TEXT NOT NULL,
    state VARCHAR(1024) NOT NULL,
    nonce VARCHAR(64) NOT NULL,
    scopes VARCHAR(255) NOT NULL,
    code_challenge VARCHAR(128) NOT NULL,
    user_id UUID,
    auth_time TIMESTAMP WITH TIME ZONE,
    code_hash BYTEA,
    authorized_at TIMESTAMP WITH TIME ZONE,
    consumed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

    CONSTRAINT pk_oidc_auth_requests PRIMARY KEY (id),
    CONSTRAINT fk_oidc_auth_requests_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT ck_oidc_auth_requests_exps_aft_created
        CHECK (expires_at > created_at),
    CONSTRAINT ck_oidc_auth_requests_cons_aft_created
        CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_oidc_auth_requests_code_hash
    ON oidc_auth_requests (code_hash)
    WHERE code_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_oidc_auth_requests_expires_at
    ON oidc_auth_requests (expires_at);

DROP TRIGGER IF EXISTS trg_oidc_auth_requests_set_updated_at ON oidc_auth_requests;
CREATE TRIGGER trg_oidc_auth_requests_set_updated_at
    BEFORE UPDATE ON oidc_auth_requests
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

UPDATE version_auth SET version_num = '7c1d9e4a6b20' RETURNING version_num;

COMMIT;
