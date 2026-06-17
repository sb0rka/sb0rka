-- Migration: fd168c58bc02

BEGIN;

SET LOCAL search_path = :"DB_AUTH_SCHEMA_NAME", pg_temp;

CREATE TABLE IF NOT EXISTS user_invites (
    id VARCHAR(64) NOT NULL, 
    user_id UUID, 
    
    description VARCHAR, 
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 

    CONSTRAINT pk_user_invites PRIMARY KEY (id), 
    CONSTRAINT fk_user_invites_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_user_invites_user_id ON user_invites (user_id);

DROP TRIGGER IF EXISTS trg_user_invites_set_updated_at ON user_invites;
CREATE TRIGGER trg_user_invites_set_updated_at
BEFORE UPDATE ON user_invites
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

UPDATE version_auth SET version_num = 'fd168c58bc02' RETURNING version_num;

COMMIT;
