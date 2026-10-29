-- Migration: d5f3a62aad85

BEGIN;

SET LOCAL search_path = :"DB_API_SCHEMA_NAME", pg_temp;

-- FUNCTIONS

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Generate a short project identifier for display.
CREATE OR REPLACE FUNCTION gen_project_public_id()
RETURNS VARCHAR(10)
LANGUAGE sql
VOLATILE
SET search_path = :"DB_API_SCHEMA_NAME", pg_temp
AS $$
    SELECT encode(gen_random_bytes(5), 'hex');
$$;

-- Generate a short resource identifier for display.
CREATE OR REPLACE FUNCTION gen_resource_public_id()
RETURNS VARCHAR(12)
LANGUAGE sql
VOLATILE
SET search_path = :"DB_API_SCHEMA_NAME", pg_temp
AS $$
    SELECT encode(gen_random_bytes(6), 'hex');
$$;

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

-- PLANS

CREATE TABLE IF NOT EXISTS plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    code VARCHAR NOT NULL UNIQUE,
    name_en VARCHAR NOT NULL,
    name_ru VARCHAR NOT NULL,
    description_en VARCHAR,
    description_ru VARCHAR,
    kind VARCHAR(8) NOT NULL
        CHECK (kind IN ('account', 'project')),

    is_public BOOLEAN DEFAULT false NOT NULL,
    is_available BOOLEAN DEFAULT true NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS trg_plans_set_updated_at ON plans;
CREATE TRIGGER trg_plans_set_updated_at BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS ix_plans_kind ON plans (kind);

-- Prevent assigning a project plan to a subject: subject_plans only accepts account plans.
CREATE OR REPLACE FUNCTION enforce_subject_plan_kind()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_plan_kind VARCHAR(8);
BEGIN
    SELECT kind INTO v_plan_kind
    FROM plans
    WHERE id = NEW.plan_id;

    IF v_plan_kind IS NULL THEN
        RAISE EXCEPTION 'plan % not found', NEW.plan_id;
    END IF;

    IF v_plan_kind <> 'account' THEN
        RAISE EXCEPTION 'subject_plans requires account plan, got %', v_plan_kind;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS subject_plans (
    subject_id UUID PRIMARY KEY,
    plan_id UUID NOT NULL REFERENCES plans (id),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

DROP TRIGGER IF EXISTS trg_subject_plans_plan_kind ON subject_plans;
CREATE TRIGGER trg_subject_plans_plan_kind
BEFORE INSERT OR UPDATE ON subject_plans
FOR EACH ROW
EXECUTE FUNCTION enforce_subject_plan_kind();

CREATE INDEX IF NOT EXISTS ix_subject_plans_plan_id
    ON subject_plans (plan_id);

-- Prevent assigning an account plan to a project: projects only accepts project plans.
CREATE OR REPLACE FUNCTION enforce_project_plan_kind()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_plan_kind VARCHAR(8);
BEGIN
    SELECT kind INTO v_plan_kind
    FROM plans
    WHERE id = NEW.plan_id;

    IF v_plan_kind IS NULL THEN
        RAISE EXCEPTION 'plan % not found', NEW.plan_id;
    END IF;

    IF v_plan_kind <> 'project' THEN
        RAISE EXCEPTION 'projects requires project plan, got %', v_plan_kind;
    END IF;

    RETURN NEW;
END;
$$;

-- PROJECTS

CREATE TABLE IF NOT EXISTS projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    public_id VARCHAR(10) DEFAULT gen_project_public_id() NOT NULL UNIQUE,
    plan_id UUID NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
    owner_subject_id UUID NOT NULL,
    billing_subject_id UUID NOT NULL,

    name VARCHAR NOT NULL,
    description VARCHAR,

    is_active BOOLEAN DEFAULT true NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT ck_projects_public_id_hex CHECK (public_id ~ '^[0-9a-f]{10}$'),
    CONSTRAINT uq_projects_owner_subj_id_name UNIQUE (owner_subject_id, name)
);

DROP TRIGGER IF EXISTS trg_projects_set_updated_at ON projects;
CREATE TRIGGER trg_projects_set_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_projects_plan_kind ON projects;
CREATE TRIGGER trg_projects_plan_kind
BEFORE INSERT OR UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION enforce_project_plan_kind();

CREATE INDEX IF NOT EXISTS ix_projects_billing_subject_id
    ON projects (billing_subject_id);

CREATE INDEX IF NOT EXISTS ix_projects_owner_subj_active
    ON projects (owner_subject_id)
    WHERE is_active = true;

CREATE TABLE IF NOT EXISTS project_members (
    project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    subject_id UUID NOT NULL,

    role VARCHAR(8) NOT NULL
        CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_project_members PRIMARY KEY (project_id, subject_id)
);

DROP TRIGGER IF EXISTS trg_proj_members_set_updated_at ON project_members;
CREATE TRIGGER trg_proj_members_set_updated_at
BEFORE UPDATE ON project_members
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS ix_project_members_subject_id
    ON project_members (subject_id);

-- RESOURCES

CREATE TABLE IF NOT EXISTS resources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    public_id VARCHAR(12) DEFAULT gen_resource_public_id() NOT NULL UNIQUE,
    project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,

    kind VARCHAR(16) NOT NULL
        CHECK (kind IN ('secret', 'dbi', 'vm')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT ck_resources_public_id_hex CHECK (public_id ~ '^[0-9a-f]{12}$'),
    CONSTRAINT uq_resources_res_id_project_id UNIQUE (id, project_id),
    CONSTRAINT uq_resources_res_id_prj_kind UNIQUE (id, project_id, kind)
);

DROP TRIGGER IF EXISTS trg_resources_set_updated_at ON resources;
CREATE TRIGGER trg_resources_set_updated_at
BEFORE UPDATE ON resources
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS ix_resources_project_kind
    ON resources (project_id, kind);

CREATE INDEX IF NOT EXISTS ix_resources_project_created_at
    ON resources (project_id, created_at);

CREATE TABLE IF NOT EXISTS resource_usage_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL,
    resource_id UUID NOT NULL,
    data JSONB DEFAULT '{}'::jsonb NOT NULL,
    started_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    finished_at TIMESTAMPTZ,

    CHECK (finished_at IS NULL OR finished_at >= started_at)
);

CREATE INDEX IF NOT EXISTS ix_resource_usage_records_project_started_at
    ON resource_usage_records (project_id, started_at);
CREATE INDEX IF NOT EXISTS ix_resource_usage_records_resource_started_at
    ON resource_usage_records (resource_id, started_at);

-- Checks the resource's belonging to the project and saves the immutable UUID
-- record after the parent deletion.
CREATE OR REPLACE FUNCTION validate_resource_usage_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = :"DB_API_SCHEMA_NAME", pg_temp
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF (NEW.id, NEW.project_id, NEW.resource_id, NEW.started_at)
            IS DISTINCT FROM (OLD.id, OLD.project_id, OLD.resource_id, OLD.started_at) THEN
            RAISE EXCEPTION 'usage identity is immutable' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    PERFORM id FROM projects WHERE id = NEW.project_id FOR KEY SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'usage project does not exist' USING ERRCODE = '23503';
    END IF;
    PERFORM id FROM resources
        WHERE id = NEW.resource_id AND project_id = NEW.project_id FOR KEY SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'usage resource does not belong to project' USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resource_usage_identity ON resource_usage_records;
CREATE TRIGGER trg_resource_usage_identity BEFORE INSERT OR UPDATE ON resource_usage_records
FOR EACH ROW EXECUTE FUNCTION validate_resource_usage_identity();

CREATE TABLE IF NOT EXISTS resource_states (
    resource_id UUID PRIMARY KEY,
    project_id UUID NOT NULL,

    runtime_state VARCHAR(16) NOT NULL
        CHECK (runtime_state IN ('syncing', 'creating', 'available', 'stopping', 'stopped', 'starting', 'deleting', 'deleted', 'failed')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT fk_res_states_res_id_resources FOREIGN KEY (resource_id, project_id) REFERENCES resources (id, project_id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_res_states_set_updated_at ON resource_states;
CREATE TRIGGER trg_res_states_set_updated_at
BEFORE UPDATE ON resource_states
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS ix_res_states_prj_id_rt_st
    ON resource_states (project_id, runtime_state);

CREATE TABLE IF NOT EXISTS dbis (
    resource_id UUID PRIMARY KEY REFERENCES resources (id) ON DELETE CASCADE,
    project_id UUID NOT NULL,

    engine VARCHAR(16) NOT NULL
        CHECK (engine IN ('postgresql')),

    name VARCHAR NOT NULL,
    normalized_name VARCHAR NOT NULL,
    desired_runtime_state VARCHAR(16) NOT NULL
        CHECK (desired_runtime_state IN ('running', 'suspended', 'terminated')),
    description VARCHAR,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT fk_dbis_res_id_proj_id_resources FOREIGN KEY (resource_id, project_id) REFERENCES resources (id, project_id) ON DELETE CASCADE,
    CONSTRAINT uq_dbis_project_id_norm_name UNIQUE (project_id, normalized_name)
);

DROP TRIGGER IF EXISTS trg_dbis_set_updated_at ON dbis;
CREATE TRIGGER trg_dbis_set_updated_at
BEFORE UPDATE ON dbis
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- SECRETS

CREATE TABLE IF NOT EXISTS encryption_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    provider VARCHAR(32) NOT NULL,
    key_ref VARCHAR NOT NULL,
    algorithm VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL
        CHECK (status IN ('active', 'disabled', 'destroyed')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    rotated_at TIMESTAMP WITH TIME ZONE,
    disabled_at TIMESTAMP WITH TIME ZONE,
    destroyed_at TIMESTAMP WITH TIME ZONE
);

DROP TRIGGER IF EXISTS trg_enc_keys_set_updated_at ON encryption_keys;
CREATE TRIGGER trg_enc_keys_set_updated_at
BEFORE UPDATE ON encryption_keys
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_enc_keys_active_provider
    ON encryption_keys (provider)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS ix_enc_keys_status_created_at
    ON encryption_keys (status, created_at DESC);

CREATE TABLE IF NOT EXISTS secrets (
    resource_id UUID PRIMARY KEY,
    project_id UUID NOT NULL,

    name VARCHAR NOT NULL,
    description VARCHAR,
    payload_kind VARCHAR(16) DEFAULT 'text' NOT NULL
        CHECK (payload_kind IN ('text', 'json', 'binary', 'llm_key')),
    protection_class VARCHAR(32) DEFAULT 'server_managed' NOT NULL
        CHECK (protection_class IN ('server_managed')),
    current_version_no INT NOT NULL,
    created_by_subject_id UUID NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    scheduled_destroy_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT uq_secrets_res_id_project_id UNIQUE (resource_id, project_id),
    CONSTRAINT uq_secrets_project_id_name UNIQUE (project_id, name),
    CONSTRAINT fk_secrets_res_id_resources FOREIGN KEY (resource_id, project_id) REFERENCES resources (id, project_id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_secrets_set_updated_at ON secrets;
CREATE TRIGGER trg_secrets_set_updated_at
BEFORE UPDATE ON secrets
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS ix_secrets_project_created_at
    ON secrets (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_secrets_proj_res_cur_version
    ON secrets (project_id, resource_id, current_version_no);

CREATE INDEX IF NOT EXISTS ix_secrets_scheduled_destroy_at
    ON secrets (scheduled_destroy_at)
    WHERE scheduled_destroy_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS secret_versions (
    project_id UUID NOT NULL,
    secret_id UUID NOT NULL,
    version_no INT NOT NULL
        CHECK (version_no > 0),

    state VARCHAR(16) NOT NULL
        CHECK (state IN ('active', 'disabled')),
    created_by_subject_id UUID NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    disabled_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT pk_secret_versions PRIMARY KEY (secret_id, version_no),
    CONSTRAINT uq_sec_ver_proj_sec_id_ver_no UNIQUE (project_id, secret_id, version_no),
    CONSTRAINT fk_sec_ver_secret_id_secrets FOREIGN KEY (secret_id, project_id) REFERENCES secrets (resource_id, project_id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_sec_versions_set_updated_at ON secret_versions;
CREATE TRIGGER trg_sec_versions_set_updated_at
BEFORE UPDATE ON secret_versions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS ix_sec_ver_proj_sec_ver_desc
    ON secret_versions (project_id, secret_id, version_no DESC);

CREATE TABLE IF NOT EXISTS secret_version_materials (
    project_id UUID NOT NULL,
    secret_id UUID NOT NULL,
    version_no INT NOT NULL
        CHECK (version_no > 0),

    encryption_key_id UUID NOT NULL REFERENCES encryption_keys (id),
    crypto_provider VARCHAR(32) NOT NULL
        CHECK (crypto_provider IN ('tink_aead')),
    crypto_envelope_version VARCHAR(32) NOT NULL,
    content_algorithm VARCHAR(64) NOT NULL,
    aad_context JSONB NOT NULL,
    encrypted_message BYTEA NOT NULL
        CHECK (octet_length(encrypted_message) > 0),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_secret_version_materials PRIMARY KEY (secret_id, version_no),
    CONSTRAINT fk_sec_ver_mat_sec_id_version FOREIGN KEY (secret_id, version_no) REFERENCES secret_versions (secret_id, version_no) ON DELETE CASCADE,
    CONSTRAINT fk_sec_ver_mat_proj_sec_ver FOREIGN KEY (project_id, secret_id, version_no) REFERENCES secret_versions (project_id, secret_id, version_no) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_sec_ver_mat_set_updated_at ON secret_version_materials;
CREATE TRIGGER trg_sec_ver_mat_set_updated_at
BEFORE UPDATE ON secret_version_materials
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS dbi_verifiers (
    dbi_id UUID PRIMARY KEY REFERENCES dbis (resource_id) ON DELETE CASCADE,
    project_id UUID NOT NULL,
    password_secret_id UUID NOT NULL,

    password_desired_version INT NOT NULL
        CHECK (password_desired_version > 0),
    password_verifier VARCHAR NOT NULL,
    password_desired_state VARCHAR(16) NOT NULL
        CHECK (password_desired_state IN ('present', 'absent')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT fk_dbi_vrf_dbi_id_proj_id_res FOREIGN KEY (dbi_id, project_id) REFERENCES resources (id, project_id) ON DELETE CASCADE,
    CONSTRAINT fk_dbi_vrf_pwd_sec_id_secrets FOREIGN KEY (password_secret_id, project_id) REFERENCES secrets (resource_id, project_id) ON DELETE RESTRICT,
    CONSTRAINT fk_dbi_vrf_proj_pwd_sec_ver FOREIGN KEY (project_id, password_secret_id, password_desired_version) REFERENCES secret_versions (project_id, secret_id, version_no) ON DELETE RESTRICT
); 

DROP TRIGGER IF EXISTS trg_dbi_verifiers_set_updated_at ON dbi_verifiers;
CREATE TRIGGER trg_dbi_verifiers_set_updated_at
BEFORE UPDATE ON dbi_verifiers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS ix_dbi_vrf_pwd_secret_id_version
    ON dbi_verifiers (
        project_id,
        password_secret_id,
        password_desired_version
    );

CREATE INDEX IF NOT EXISTS ix_dbi_vrf_project_desired_state
    ON dbi_verifiers (project_id, password_desired_state);

-- TAGS

CREATE TABLE IF NOT EXISTS tags (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,

    tag_key VARCHAR NOT NULL,
    tag_value VARCHAR NOT NULL,
    color VARCHAR,

    is_system BOOLEAN DEFAULT false NOT NULL,
    is_readonly BOOLEAN DEFAULT false NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT uq_tags_id_project_id UNIQUE (id, project_id),
    CONSTRAINT uq_tags_project_id_tag_kv UNIQUE (project_id, tag_key, tag_value)
);

DROP TRIGGER IF EXISTS trg_tags_set_updated_at ON tags;
CREATE TRIGGER trg_tags_set_updated_at
BEFORE UPDATE ON tags
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS resource_tags (
    tag_id BIGINT NOT NULL,
    project_id UUID NOT NULL,
    resource_id UUID NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    
    CONSTRAINT pk_resource_tags PRIMARY KEY (project_id, resource_id, tag_id),
    CONSTRAINT fk_res_tags_res_id_resources FOREIGN KEY (resource_id, project_id) REFERENCES resources (id, project_id) ON DELETE CASCADE,
    CONSTRAINT fk_res_tags_tag_id_tags FOREIGN KEY (tag_id, project_id) REFERENCES tags (id, project_id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_resource_tags_set_updated_at ON resource_tags;
CREATE TRIGGER trg_resource_tags_set_updated_at
BEFORE UPDATE ON resource_tags
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS ix_resource_tags_proj_tag_res
    ON resource_tags (project_id, tag_id, resource_id);

-- DRONES

-- Deletes a terminated database and its password secret.
CREATE OR REPLACE FUNCTION cleanup_one_deleted_dbi()
RETURNS TABLE (
    project_id UUID,
    database_id UUID,
    secret_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = :"DB_API_SCHEMA_NAME", pg_temp
AS $$
DECLARE
    v_project_id UUID;
    v_database_id UUID;
    v_secret_id UUID;
    v_tag_ids BIGINT[];
    v_rows BIGINT;
BEGIN
    SELECT
        d.project_id,
        d.resource_id,
        dv.password_secret_id
    INTO v_project_id, v_database_id, v_secret_id
    FROM dbis d
    JOIN resources r_db
        ON r_db.id = d.resource_id
       AND r_db.project_id = d.project_id
       AND r_db.kind = 'dbi'
    JOIN resource_states rs_db
        ON rs_db.project_id = d.project_id
       AND rs_db.resource_id = d.resource_id
    JOIN dbi_verifiers dv
        ON dv.dbi_id = d.resource_id
       AND dv.project_id = d.project_id
    JOIN resources r_secret
        ON r_secret.id = dv.password_secret_id
       AND r_secret.project_id = d.project_id
       AND r_secret.kind = 'secret'
    JOIN resource_states rs_secret
        ON rs_secret.project_id = d.project_id
       AND rs_secret.resource_id = dv.password_secret_id
    WHERE d.desired_runtime_state = 'terminated'
      AND rs_db.runtime_state = 'deleted'
      AND rs_secret.runtime_state = 'deleted'
      AND dv.password_desired_state = 'absent'
    ORDER BY r_db.created_at ASC
    LIMIT 1
    FOR UPDATE OF d, r_db, rs_db, dv, r_secret, rs_secret SKIP LOCKED;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT array_agg(linked_tag.id)
    INTO v_tag_ids
    FROM (
        SELECT t.id
        FROM tags t
        WHERE t.project_id = v_project_id
          AND EXISTS (
              SELECT 1
              FROM resource_tags rt
              WHERE rt.project_id = v_project_id
                AND rt.tag_id = t.id
                AND rt.resource_id IN (v_database_id, v_secret_id)
          )
        ORDER BY t.id
        FOR UPDATE OF t
    ) linked_tag;

    DELETE FROM resources r
    WHERE r.id = v_database_id
      AND r.project_id = v_project_id
      AND r.kind = 'dbi';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
        RAISE EXCEPTION 'database resource delete affected % rows', v_rows;
    END IF;

    DELETE FROM resources r
    WHERE r.id = v_secret_id
      AND r.project_id = v_project_id
      AND r.kind = 'secret';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
        RAISE EXCEPTION 'secret resource delete affected % rows', v_rows;
    END IF;

    DELETE FROM tags t
    WHERE t.id = ANY(v_tag_ids)
      AND t.project_id = v_project_id
      AND NOT EXISTS (
          SELECT 1
          FROM resource_tags rt
          WHERE rt.project_id = v_project_id
            AND rt.tag_id = t.id
      );

    project_id := v_project_id;
    database_id := v_database_id;
    secret_id := v_secret_id;
    RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION cleanup_one_deleted_dbi() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_one_deleted_dbi() TO :"DB_DRONE_MAPPING_USER";

WITH updated AS (
    UPDATE version_platform
    SET version_num = 'd5f3a62aad85'
    RETURNING version_platform.version_num
)
INSERT INTO version_platform (version_num)
SELECT 'd5f3a62aad85'
WHERE NOT EXISTS (SELECT 1 FROM updated)
RETURNING version_num;

COMMIT;
