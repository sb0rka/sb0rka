-- Migration: d2170a231906

BEGIN;

SET LOCAL search_path = :"DB_AUTH_SCHEMA_NAME", pg_temp;

-- Update the updated_at column when the row is updated.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Subjects

CREATE TABLE IF NOT EXISTS subjects (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

    kind VARCHAR(16) NOT NULL CHECK (kind IN ('user', 'service', 'agent')),

    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS user_principals (
    id UUID DEFAULT gen_random_uuid() NOT NULL REFERENCES subjects (id) ON DELETE CASCADE PRIMARY KEY, 

    username VARCHAR(128) NOT NULL UNIQUE, 
    email VARCHAR(128) NOT NULL UNIQUE,
    email_verified_at TIMESTAMPTZ,
    phone INTEGER UNIQUE, 
    phone_verified_at TIMESTAMPTZ,

    password_hash VARCHAR(512) NOT NULL,

    is_active BOOLEAN DEFAULT true NOT NULL,

    created_at TIMESTAMPTZ DEFAULT now() NOT NULL, 
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS trg_user_principals_set_updated_at ON user_principals;
CREATE TRIGGER trg_user_principals_set_updated_at
BEFORE UPDATE ON user_principals
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS service_principals (
    subject_id UUID NOT NULL REFERENCES subjects (id) ON DELETE CASCADE PRIMARY KEY,

    name VARCHAR(64) NOT NULL UNIQUE,

    created_at TIMESTAMPTZ DEFAULT now() NOT NULL, 
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS trg_service_principals_set_updated_at ON service_principals;
CREATE TRIGGER trg_service_principals_set_updated_at
BEFORE UPDATE ON service_principals
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Auth Sessions

CREATE TABLE IF NOT EXISTS auth_sessions (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY, 

    subject_id UUID NOT NULL REFERENCES subjects (id) ON DELETE CASCADE, 
    family_id UUID DEFAULT gen_random_uuid() NOT NULL, 
    created_ip INET NOT NULL, 
    created_user_agent VARCHAR(1024),
    oauth_scopes TEXT[] DEFAULT '{openid,profile,email,offline_access}' NOT NULL,
    oauth_client_id VARCHAR(128),

    auth_time TIMESTAMPTZ DEFAULT now() NOT NULL,

    created_at TIMESTAMPTZ DEFAULT now() NOT NULL, 
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL, 
    expires_at TIMESTAMPTZ NOT NULL, 
    revoked_at TIMESTAMPTZ, 

    revoke_reason VARCHAR(255), 
    replaced_by UUID REFERENCES auth_sessions (id) ON DELETE SET NULL,

    CONSTRAINT ck_auth_sess_repl_not_self CHECK (replaced_by IS NULL OR replaced_by <> id),
    CONSTRAINT ck_auth_sess_exps_aft_created CHECK (expires_at > created_at),
    CONSTRAINT ck_auth_sess_rev_aft_created CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

DROP TRIGGER IF EXISTS trg_auth_sessions_set_updated_at ON auth_sessions;
CREATE TRIGGER trg_auth_sessions_set_updated_at
BEFORE UPDATE ON auth_sessions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS ix_auth_sess_oauth_client_active
    ON auth_sessions (subject_id, oauth_client_id)
    WHERE oauth_client_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_auth_sess_replaced_by ON auth_sessions (replaced_by);

CREATE INDEX IF NOT EXISTS ix_auth_sess_subject_created_at ON auth_sessions (subject_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_sess_family_active ON auth_sessions (family_id) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_auth_sess_subject_active ON auth_sessions (subject_id) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_auth_sess_active_expires_at ON auth_sessions (expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,

    session_id UUID NOT NULL REFERENCES auth_sessions (id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    replaced_by UUID REFERENCES auth_refresh_tokens (id) ON DELETE SET NULL,

    -- Replay of a retried rotation (Idempotency-Key): the sealed response is
    -- kept for a short window after the token is consumed.
    operation_id TEXT,
    response_encrypted TEXT,
    response_expires_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,

    CONSTRAINT ck_auth_refresh_tokens_exps_aft_created CHECK (expires_at > created_at)
);

-- A session has exactly one unconsumed refresh token at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_refresh_tokens_session_current
    ON auth_refresh_tokens (session_id)
    WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_auth_refresh_tokens_session_id
    ON auth_refresh_tokens (session_id);

DROP TRIGGER IF EXISTS trg_auth_refresh_tokens_set_updated_at ON auth_refresh_tokens;
CREATE TRIGGER trg_auth_refresh_tokens_set_updated_at
BEFORE UPDATE ON auth_refresh_tokens
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- OIDC

CREATE TABLE IF NOT EXISTS oidc_auth_requests (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,

    user_id UUID REFERENCES user_principals (id) ON DELETE CASCADE,
    -- Password changes revoke the session and cascade to in-flight authorization.
    source_session_id UUID REFERENCES auth_sessions (id) ON DELETE CASCADE,

    client_id VARCHAR(128) NOT NULL,
    redirect_uri TEXT NOT NULL,
    state VARCHAR(1024) NOT NULL,
    nonce VARCHAR(64) NOT NULL,
    scopes VARCHAR(255) NOT NULL,
    code_challenge VARCHAR(128) NOT NULL,
    auth_time TIMESTAMPTZ,
    code_hash BYTEA UNIQUE,

    authorized_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

    CONSTRAINT ck_oidc_auth_requests_exps_aft_created
        CHECK (expires_at > created_at),
    CONSTRAINT ck_oidc_auth_requests_cons_aft_created
        CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

DROP TRIGGER IF EXISTS trg_oidc_auth_requests_set_updated_at ON oidc_auth_requests;
CREATE TRIGGER trg_oidc_auth_requests_set_updated_at
    BEFORE UPDATE ON oidc_auth_requests
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS ix_oidc_auth_requests_expires_at
    ON oidc_auth_requests (expires_at);

CREATE INDEX IF NOT EXISTS ix_oidc_source_session
    ON oidc_auth_requests (source_session_id);

-- Platform Clients

CREATE TABLE IF NOT EXISTS platform_clients (
    client_id VARCHAR(128) NOT NULL PRIMARY KEY,

    actor_subject_id UUID REFERENCES service_principals (subject_id) ON DELETE CASCADE,
    can_delegate BOOLEAN DEFAULT false NOT NULL,
    can_attest_agent BOOLEAN DEFAULT false NOT NULL,
    policy JSONB DEFAULT '{}'::jsonb NOT NULL,

    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL, 
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS trg_platform_clients_set_updated_at ON platform_clients;
CREATE TRIGGER trg_platform_clients_set_updated_at
BEFORE UPDATE ON platform_clients
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- One agent principal per attester client and Host.
CREATE TABLE IF NOT EXISTS agent_principals (
    subject_id UUID NOT NULL REFERENCES subjects (id) ON DELETE CASCADE PRIMARY KEY,

    attester_client_id VARCHAR(128) NOT NULL REFERENCES platform_clients (client_id) ON DELETE CASCADE,
    host_id UUID NOT NULL,
    public_key BYTEA,
    key_thumbprint VARCHAR(64),

    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

    CONSTRAINT uq_agent_principals_attester_client_id_host_id UNIQUE (attester_client_id, host_id),
    CONSTRAINT ck_agent_principals_key_pair CHECK (
        (public_key IS NULL AND key_thumbprint IS NULL)
        OR (public_key IS NOT NULL AND key_thumbprint IS NOT NULL AND octet_length(public_key) = 32)
    )
);

DROP TRIGGER IF EXISTS trg_agent_principals_set_updated_at ON agent_principals;
CREATE TRIGGER trg_agent_principals_set_updated_at
BEFORE UPDATE ON agent_principals
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- The reserving user's verified login subject. NULL is a legacy principal and cannot be invited.
ALTER TABLE agent_principals
    ADD COLUMN IF NOT EXISTS owner_subject_id UUID REFERENCES user_principals (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_agent_principals_owner_subject_id
    ON agent_principals (owner_subject_id);

-- Delegations

CREATE TABLE IF NOT EXISTS delegation_grants (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,

    user_id UUID NOT NULL REFERENCES user_principals (id) ON DELETE CASCADE,
    client_id VARCHAR(128) NOT NULL REFERENCES platform_clients (client_id) ON DELETE CASCADE,
    actor_service_id UUID NOT NULL REFERENCES service_principals (subject_id) ON DELETE CASCADE,

    audience VARCHAR(64) NOT NULL,
    scopes TEXT[] NOT NULL,
    project_ids TEXT[] NOT NULL,
    version BIGINT DEFAULT 1 NOT NULL,

    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

    CONSTRAINT uq_delegation_grants_user_client_audience UNIQUE (user_id, client_id, audience),
    CONSTRAINT ck_delegation_grants_scopes_not_empty CHECK (cardinality(scopes) > 0),
    CONSTRAINT ck_delegation_grants_project_ids_not_empty CHECK (cardinality(project_ids) > 0)
);

DROP TRIGGER IF EXISTS trg_delegation_grants_set_updated_at ON delegation_grants;
CREATE TRIGGER trg_delegation_grants_set_updated_at
BEFORE UPDATE ON delegation_grants
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS delegation_requests (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,

    user_id UUID NOT NULL REFERENCES user_principals (id) ON DELETE CASCADE,
    -- Password changes revoke the session and cascade to in-flight authorization.
    source_session_id UUID REFERENCES auth_sessions (id) ON DELETE CASCADE,
    client_id VARCHAR(128) NOT NULL REFERENCES platform_clients (client_id) ON DELETE CASCADE,
    grant_id UUID REFERENCES delegation_grants (id) ON DELETE CASCADE,

    redirect_uri TEXT NOT NULL,
    state TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    code_hash BYTEA UNIQUE,
    
    audience VARCHAR(64) DEFAULT 'sb0rka-api' NOT NULL,

    consumed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT now() + interval '10 minutes' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS trg_delegation_requests_set_updated_at ON delegation_requests;
CREATE TRIGGER trg_delegation_requests_set_updated_at
BEFORE UPDATE ON delegation_requests
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS ix_delegation_source_session
    ON delegation_requests (source_session_id);

-- Audit

CREATE TABLE IF NOT EXISTS platform_auth_audit (
    id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL PRIMARY KEY,

    action VARCHAR(64) NOT NULL,
    client_id VARCHAR(128) NOT NULL,
    subject_id UUID,
    host_id UUID,
    key_thumbprint VARCHAR(64),
    attestation_id UUID,
    token_jti UUID,
    result VARCHAR(32) NOT NULL,

    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Durable counters so password-attempt limits survive restarts and stay atomic across replicas.
-- The bucket key is a hash: no password, raw IP or account identifier is stored.
CREATE TABLE IF NOT EXISTS authentication_attempts (
    bucket_hash BYTEA NOT NULL,
    attempts INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT pk_authentication_attempts PRIMARY KEY (bucket_hash),
    CONSTRAINT ck_authentication_attempts_hash CHECK (octet_length(bucket_hash) = 32),
    CONSTRAINT ck_authentication_attempts_count CHECK (attempts > 0)
);

CREATE INDEX IF NOT EXISTS ix_authentication_attempts_expiry
    ON authentication_attempts (expires_at);

-- FUNCTIONS

-- A session is live only while it belongs to an active user and has not expired or been revoked.
CREATE OR REPLACE FUNCTION is_live_session(p_sid uuid, p_sub uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = :"DB_AUTH_SCHEMA_NAME", pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM auth_sessions s
        JOIN user_principals u ON u.id = s.subject_id
        WHERE s.id = p_sid
          AND s.subject_id = p_sub
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND u.is_active
    );
$$;

-- Direct user access is allowed only for a live client registered for this audience.
CREATE OR REPLACE FUNCTION is_registered_access_client(p_client text, p_audience text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = :"DB_AUTH_SCHEMA_NAME", pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM platform_clients c
        WHERE c.client_id = p_client AND c.revoked_at IS NULL
          AND c.policy->>'access_audience' = p_audience
    );
$$;

-- A delegated call is live only for the current grant version, registered actor, audience and scopes.
CREATE OR REPLACE FUNCTION is_live_delegation(
    p_id uuid, p_version bigint, p_sub uuid, p_client text, p_actor uuid,
    p_scopes text[], p_projects text[], p_audience text
)
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = :"DB_AUTH_SCHEMA_NAME", pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM delegation_grants g
        JOIN platform_clients c ON c.client_id = g.client_id
        WHERE g.id = p_id AND g.version = p_version AND g.user_id = p_sub
          AND g.client_id = p_client AND g.actor_service_id = p_actor
          AND g.revoked_at IS NULL AND c.revoked_at IS NULL AND c.can_delegate
          AND c.actor_subject_id = p_actor AND g.audience = p_audience
          AND cardinality(p_scopes) > 0 AND cardinality(p_projects) > 0
          AND p_scopes <@ g.scopes AND p_projects <@ g.project_ids
          AND c.policy->'delegation_policies' ? p_audience
          AND NOT EXISTS (
              SELECT 1 FROM unnest(p_scopes) scope
              WHERE NOT (c.policy->'delegation_policies'->p_audience ? scope)
          )
    );
$$;

-- An agent may call the API only while its key is enrolled and its attester is a live
-- confidential client that is still allowed to attest.
CREATE OR REPLACE FUNCTION is_live_agent(p_sub uuid, p_host uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = :"DB_AUTH_SCHEMA_NAME", pg_temp AS $$
    SELECT EXISTS (
        SELECT 1
        FROM agent_principals d
        JOIN subjects s ON s.id = d.subject_id AND s.kind = 'agent'
        JOIN platform_clients c ON c.client_id = d.attester_client_id
        WHERE d.subject_id = p_sub
          AND d.host_id = p_host
          AND d.revoked_at IS NULL
          AND d.public_key IS NOT NULL
          AND d.key_thumbprint IS NOT NULL
          AND c.revoked_at IS NULL
          AND c.can_attest_agent
          AND c.policy @> '{"enabled":true,"can_attest":true,"type":"confidential"}'::jsonb
          AND c.policy->'grant_types' ? 'urn:sb0rka:params:oauth:grant-type:agent'
    );
$$;

-- The token must name the same attester client and key thumbprint.
CREATE OR REPLACE FUNCTION is_live_agent(p_sub uuid, p_host uuid, p_client text, p_thumbprint text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = :"DB_AUTH_SCHEMA_NAME", pg_temp AS $$
    SELECT is_live_agent(p_sub, p_host) AND EXISTS (
        SELECT 1
        FROM agent_principals d
        WHERE d.subject_id = p_sub
          AND d.attester_client_id = p_client
          AND d.key_thumbprint = p_thumbprint
    );
$$;

-- A new overload must not acquire broader EXECUTE rights than the two-argument predicate.
DO $$
DECLARE permission record;
BEGIN
    REVOKE EXECUTE ON FUNCTION is_live_agent(uuid, uuid, text, text) FROM PUBLIC;
    FOR permission IN
        SELECT grantee, is_grantable
        FROM aclexplode(COALESCE(
            (SELECT proacl FROM pg_proc WHERE oid = 'is_live_agent(uuid,uuid)'::regprocedure),
            acldefault('f', (SELECT proowner FROM pg_proc WHERE oid = 'is_live_agent(uuid,uuid)'::regprocedure))))
        WHERE privilege_type = 'EXECUTE'
    LOOP
        EXECUTE format(
            'GRANT EXECUTE ON FUNCTION %I.is_live_agent(uuid, uuid, text, text) TO %s%s',
            current_schema(),
            CASE WHEN permission.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(permission.grantee)) END,
            CASE WHEN permission.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END
        );
    END LOOP;
END;
$$;

-- A delegated user may manage an agent only when this actor's client attested it
-- and the user is the principal's owner. A shared service actor is not enough.
DROP FUNCTION IF EXISTS is_agent_of_actor(uuid, uuid);
CREATE OR REPLACE FUNCTION is_agent_of_user(p_agent uuid, p_actor uuid, p_user uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = :"DB_AUTH_SCHEMA_NAME", pg_temp AS $$
    SELECT EXISTS (
        SELECT 1
        FROM agent_principals d
        JOIN platform_clients c ON c.client_id = d.attester_client_id
        WHERE d.subject_id = p_agent
          AND d.owner_subject_id = p_user
          AND d.revoked_at IS NULL
          AND c.revoked_at IS NULL
          AND c.actor_subject_id = p_actor
    );
$$;

WITH updated AS (
    UPDATE version_auth
    SET version_num = 'b6c1d8e04f93'
    RETURNING version_num
)
INSERT INTO version_auth (version_num)
SELECT 'b6c1d8e04f93'
WHERE NOT EXISTS (SELECT 1 FROM updated)
RETURNING version_num;

COMMIT;
