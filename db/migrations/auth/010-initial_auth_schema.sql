-- Migration: d2170a231906

BEGIN;

SET LOCAL search_path = :"DB_AUTH_SCHEMA_NAME", pg_temp;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS subjects (
    id UUID NOT NULL,

    kind VARCHAR NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_subjects PRIMARY KEY (id),
    CONSTRAINT subjects_kind_check CHECK (kind IN ('user'))
);

DROP TRIGGER IF EXISTS trg_subjects_set_updated_at ON subjects;
CREATE TRIGGER trg_subjects_set_updated_at
BEFORE UPDATE ON subjects
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() NOT NULL, 

    is_active BOOLEAN DEFAULT true NOT NULL, 
    username VARCHAR(128) NOT NULL, 
    email VARCHAR(128) NOT NULL, 
    phone INTEGER, 
    password_hash VARCHAR(512) NOT NULL, 

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_users PRIMARY KEY (id), 
    CONSTRAINT fk_users_id_subjects FOREIGN KEY (id) REFERENCES subjects (id) ON DELETE CASCADE,
    CONSTRAINT uq_users_phone UNIQUE (phone),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT uq_users_username UNIQUE (username)
);

DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;
CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS auth_sessions (
    id UUID DEFAULT gen_random_uuid() NOT NULL, 

    subject_id UUID NOT NULL, 
    family_id UUID DEFAULT gen_random_uuid() NOT NULL, 
    refresh_token_hash VARCHAR(255) NOT NULL, 
    created_ip INET NOT NULL, 
    created_user_agent VARCHAR(1024), 

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    revoked_at TIMESTAMP WITH TIME ZONE, 

    revoke_reason VARCHAR(255), 
    replaced_by UUID,

    CONSTRAINT pk_auth_sessions PRIMARY KEY (id),
    CONSTRAINT fk_auth_sess_repl_by_auth_sess FOREIGN KEY (replaced_by) REFERENCES auth_sessions (id) ON DELETE SET NULL,
    CONSTRAINT fk_auth_sessions_subject_id_subjects FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE CASCADE,
    CONSTRAINT ck_auth_sess_repl_not_self CHECK (replaced_by IS NULL OR replaced_by <> id),
    CONSTRAINT ck_auth_sess_exps_aft_created CHECK (expires_at > created_at),
    CONSTRAINT ck_auth_sess_rev_aft_created CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

DROP TRIGGER IF EXISTS trg_auth_sessions_set_updated_at ON auth_sessions;
CREATE TRIGGER trg_auth_sessions_set_updated_at
BEFORE UPDATE ON auth_sessions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS ix_auth_sess_replaced_by ON auth_sessions (replaced_by);

CREATE INDEX IF NOT EXISTS ix_auth_sess_subject_created_at ON auth_sessions (subject_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_sess_family_active ON auth_sessions (family_id) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_auth_sess_subject_active ON auth_sessions (subject_id) WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ix_auth_sess_rf_tok_hsh ON auth_sessions (refresh_token_hash);

CREATE INDEX IF NOT EXISTS ix_auth_sess_active_expires_at ON auth_sessions (expires_at) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION is_live_session(p_sid uuid, p_sub uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = :"DB_AUTH_SCHEMA_NAME", pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM auth_sessions s
        WHERE s.id = p_sid
          AND s.subject_id = p_sub
          AND s.revoked_at IS NULL
          AND s.expires_at > NOW()
    );
END;
$$;

WITH updated AS (
    UPDATE version_auth
    SET version_num = 'd2170a231906'
    RETURNING version_num
)
INSERT INTO version_auth (version_num)
SELECT 'd2170a231906'
WHERE NOT EXISTS (SELECT 1 FROM updated)
RETURNING version_num;

COMMIT;
