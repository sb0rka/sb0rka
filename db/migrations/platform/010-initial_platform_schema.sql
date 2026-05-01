-- Migration: d5f3a62aad85

BEGIN;

-- FUNCTIONS

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION core.gen_project_id()
RETURNS VARCHAR(10)
LANGUAGE sql
VOLATILE
AS $$
    SELECT encode(gen_random_bytes(5), 'hex');
$$;

CREATE OR REPLACE FUNCTION core.gen_resource_id()
RETURNS VARCHAR(12)
LANGUAGE sql
VOLATILE
AS $$
    SELECT encode(gen_random_bytes(6), 'hex');
$$;

CREATE OR REPLACE FUNCTION core.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- IAM

CREATE TABLE IF NOT EXISTS core.subjects (
    id UUID NOT NULL,

    kind VARCHAR NOT NULL
        CHECK (kind IN ('user', 'organization', 'service_account')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_subjects PRIMARY KEY (id)
);

DROP TRIGGER IF EXISTS trg_subjects_set_updated_at ON core.subjects;
CREATE TRIGGER trg_subjects_set_updated_at
BEFORE UPDATE ON core.subjects
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

CREATE TABLE IF NOT EXISTS core.organizations (
    id UUID NOT NULL,

    name VARCHAR NOT NULL,
    description VARCHAR,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_organizations PRIMARY KEY (id),
    CONSTRAINT fk_organizations_id_subjects FOREIGN KEY (id) REFERENCES core.subjects (id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_organizations_set_updated_at ON core.organizations;
CREATE TRIGGER trg_organizations_set_updated_at
BEFORE UPDATE ON core.organizations
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

CREATE TABLE IF NOT EXISTS core.organization_members (
    user_id UUID NOT NULL,
    organization_id UUID NOT NULL,

    role VARCHAR(8) NOT NULL
        CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_organization_members PRIMARY KEY (user_id, organization_id),
    CONSTRAINT fk_org_members_org_id_orgs FOREIGN KEY (organization_id) REFERENCES core.organizations (id) ON DELETE CASCADE,
    CONSTRAINT fk_org_members_user_id_subjects FOREIGN KEY (user_id) REFERENCES core.subjects (id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_org_members_set_updated_at ON core.organization_members;
CREATE TRIGGER trg_org_members_set_updated_at
BEFORE UPDATE ON core.organization_members
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

CREATE INDEX idx_org_members_organization_id
    ON core.organization_members (organization_id);

-- PLANS & QUOTAS

CREATE TABLE IF NOT EXISTS core.plans (
    id UUID DEFAULT gen_random_uuid() NOT NULL,

    name VARCHAR NOT NULL,
    description VARCHAR,
    code VARCHAR NOT NULL,
    kind VARCHAR(8) NOT NULL
        CHECK (kind IN ('account', 'project')),

    is_public BOOLEAN DEFAULT false NOT NULL,
    is_available BOOLEAN DEFAULT true NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_plans PRIMARY KEY (id),
    CONSTRAINT uq_plans_code UNIQUE (code)
);

DROP TRIGGER IF EXISTS trg_plans_set_updated_at ON core.plans;
CREATE TRIGGER trg_plans_set_updated_at
BEFORE UPDATE ON core.plans
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

CREATE INDEX idx_plans_kind
    ON core.plans (kind);

CREATE TABLE IF NOT EXISTS core.subject_plans (
    subject_id UUID NOT NULL,
    plan_id UUID NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_subject_plans PRIMARY KEY (subject_id),
    CONSTRAINT fk_subject_plans_plan_id_plans FOREIGN KEY (plan_id) REFERENCES core.plans (id),
    CONSTRAINT fk_sub_plans_subject_id_subjects FOREIGN KEY (subject_id) REFERENCES core.subjects (id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_subject_plans_set_updated_at ON core.subject_plans;
CREATE TRIGGER trg_subject_plans_set_updated_at
BEFORE UPDATE ON core.subject_plans
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

CREATE INDEX idx_subject_plans_plan_id
    ON core.subject_plans (plan_id);

CREATE TABLE IF NOT EXISTS core.quota_definitions (
    id UUID DEFAULT gen_random_uuid() NOT NULL,

    name VARCHAR NOT NULL,
    description VARCHAR,
    code VARCHAR NOT NULL,
    scope VARCHAR(8) NOT NULL
        CHECK (scope IN ('account', 'project')),
    unit VARCHAR(16) NOT NULL
        CHECK (unit IN ('count', 'bytes', 'bps')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_quota_definitions PRIMARY KEY (id),
    CONSTRAINT uq_quota_definitions_code UNIQUE (code)
);

DROP TRIGGER IF EXISTS trg_quota_defs_set_updated_at ON core.quota_definitions;
CREATE TRIGGER trg_quota_defs_set_updated_at
BEFORE UPDATE ON core.quota_definitions
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

CREATE INDEX idx_quota_definitions_scope
    ON core.quota_definitions (scope);

CREATE TABLE IF NOT EXISTS core.plan_quotas (
    plan_id UUID NOT NULL,
    quota_definition_id UUID NOT NULL,

    limit_value BIGINT NOT NULL
        CHECK (limit_value >= 0),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_plan_quotas PRIMARY KEY (plan_id, quota_definition_id),
    CONSTRAINT fk_plan_quotas_plan_id_plans FOREIGN KEY (plan_id) REFERENCES core.plans (id),
    CONSTRAINT fk_plan_quotas_qdef_id_qdefs FOREIGN KEY (quota_definition_id) REFERENCES core.quota_definitions (id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_plan_quotas_set_updated_at ON core.plan_quotas;
CREATE TRIGGER trg_plan_quotas_set_updated_at
BEFORE UPDATE ON core.plan_quotas
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

CREATE INDEX idx_plan_quotas_quota_def_id
    ON core.plan_quotas (quota_definition_id);

-- PROJECTS

CREATE TABLE IF NOT EXISTS core.projects (
    id VARCHAR(12) DEFAULT core.gen_project_id() NOT NULL,
    plan_id UUID NOT NULL,
    owner_subject_id UUID NOT NULL,
    billing_subject_id UUID NOT NULL,

    name VARCHAR NOT NULL,
    description VARCHAR,

    is_active BOOLEAN DEFAULT true NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_projects PRIMARY KEY (id),
    CONSTRAINT ck_projects_project_id_hex CHECK (id ~ '^[0-9a-f]{12}$'),
    CONSTRAINT uq_projects_owner_subj_id_name UNIQUE (owner_subject_id, name),
    CONSTRAINT fk_projects_plan_id_plans FOREIGN KEY (plan_id) REFERENCES core.plans (id) ON DELETE CASCADE,
    CONSTRAINT fk_prj_owner_subject_id_subjects FOREIGN KEY (owner_subject_id) REFERENCES core.subjects (id) ON DELETE CASCADE,
    CONSTRAINT fk_prj_billing_subj_id_subjects FOREIGN KEY (billing_subject_id) REFERENCES core.subjects (id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_projects_set_updated_at ON core.projects;
CREATE TRIGGER trg_projects_set_updated_at
BEFORE UPDATE ON core.projects
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

CREATE INDEX idx_projects_billing_subject_id
    ON core.projects (billing_subject_id);

CREATE INDEX idx_projects_owner_subj_active
    ON core.projects (owner_subject_id)
    WHERE is_active = true;

CREATE TABLE IF NOT EXISTS core.project_members (
    project_id VARCHAR(12) NOT NULL,
    subject_id UUID NOT NULL,

    role VARCHAR(8) NOT NULL
        CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_project_members PRIMARY KEY (project_id, subject_id),
    CONSTRAINT fk_proj_members_proj_id_projects FOREIGN KEY (project_id) REFERENCES core.projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_proj_members_subj_id_subjects FOREIGN KEY (subject_id) REFERENCES core.subjects (id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_proj_members_set_updated_at ON core.project_members;
CREATE TRIGGER trg_proj_members_set_updated_at
BEFORE UPDATE ON core.project_members
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

CREATE INDEX idx_project_members_subject_id
    ON core.project_members (subject_id);

-- RESOURCES

CREATE TABLE IF NOT EXISTS core.resources (
    id VARCHAR(16) DEFAULT core.gen_resource_id() NOT NULL,
    project_id VARCHAR(12) NOT NULL,

    kind VARCHAR(16) NOT NULL
        CHECK (kind IN ('database', 'secret')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_resources PRIMARY KEY (id),
    CONSTRAINT ck_resources_resource_id_hex CHECK (id ~ '^[0-9a-f]{16}$'),
    CONSTRAINT fk_resources_project_id_projects FOREIGN KEY (project_id) REFERENCES core.projects (id) ON DELETE CASCADE,
    CONSTRAINT uq_resources_res_id_project_id UNIQUE (id, project_id),
    CONSTRAINT uq_resources_res_id_prj_kind UNIQUE (id, project_id, kind)
);

DROP TRIGGER IF EXISTS trg_resources_set_updated_at ON core.resources;
CREATE TRIGGER trg_resources_set_updated_at
BEFORE UPDATE ON core.resources
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

CREATE INDEX idx_resources_project_kind
    ON core.resources (project_id, kind);

CREATE INDEX idx_resources_project_created_at
    ON core.resources (project_id, created_at);

CREATE TABLE IF NOT EXISTS core.resource_states (
    project_id VARCHAR(12) NOT NULL,
    resource_id VARCHAR(16) NOT NULL,

    runtime_state VARCHAR(16) NOT NULL
        CHECK (runtime_state IN ('syncing', 'creating', 'available', 'stopping', 'stopped', 'starting', 'deleting', 'deleted', 'failed')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_resource_states PRIMARY KEY (resource_id),
    CONSTRAINT fk_res_states_res_id_resources FOREIGN KEY (resource_id, project_id) REFERENCES core.resources (id, project_id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_res_states_set_updated_at ON core.resource_states;
CREATE TRIGGER trg_res_states_set_updated_at
BEFORE UPDATE ON core.resource_states
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

CREATE INDEX idx_res_states_prj_id_rt_st
    ON core.resource_states (project_id, runtime_state);

CREATE TABLE IF NOT EXISTS core.dbs (
    project_id VARCHAR(12) NOT NULL,
    resource_id VARCHAR(16) NOT NULL,

    name VARCHAR NOT NULL,
    normalized_name VARCHAR NOT NULL,
    desired_runtime_state VARCHAR(16) NOT NULL
        CHECK (desired_runtime_state IN ('running', 'suspended', 'terminated')),
    description VARCHAR,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_dbs PRIMARY KEY (resource_id),
    CONSTRAINT fk_dbs_resource_id_resources FOREIGN KEY (resource_id) REFERENCES core.resources (id) ON DELETE CASCADE,
    CONSTRAINT fk_dbs_res_id_proj_id_resources FOREIGN KEY (resource_id, project_id) REFERENCES core.resources (id, project_id) ON DELETE CASCADE,
    CONSTRAINT uq_dbs_project_id_norm_name UNIQUE (project_id, normalized_name)
);

DROP TRIGGER IF EXISTS trg_dbs_set_updated_at ON core.dbs;
CREATE TRIGGER trg_dbs_set_updated_at
BEFORE UPDATE ON core.dbs
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

-- SECRETS

CREATE TABLE IF NOT EXISTS core.encryption_keys (
    id UUID DEFAULT gen_random_uuid() NOT NULL,

    provider VARCHAR(32) NOT NULL,
    key_ref VARCHAR NOT NULL,
    algorithm VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL
        CHECK (status IN ('active', 'disabled', 'destroyed')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    rotated_at TIMESTAMP WITH TIME ZONE,
    disabled_at TIMESTAMP WITH TIME ZONE,
    destroyed_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT pk_encryption_keys PRIMARY KEY (id)
);

DROP TRIGGER IF EXISTS trg_enc_keys_set_updated_at ON core.encryption_keys;
CREATE TRIGGER trg_enc_keys_set_updated_at
BEFORE UPDATE ON core.encryption_keys
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

CREATE UNIQUE INDEX uq_enc_keys_active_provider
    ON core.encryption_keys (provider)
    WHERE status = 'active';

CREATE INDEX idx_enc_keys_status_created_at
    ON core.encryption_keys (status, created_at DESC);

CREATE TABLE IF NOT EXISTS core.secrets (
    project_id VARCHAR(12) NOT NULL,
    resource_id VARCHAR(16) NOT NULL,

    name VARCHAR NOT NULL,
    description VARCHAR,
    payload_kind VARCHAR(16) DEFAULT 'text' NOT NULL
        CHECK (payload_kind IN ('text', 'json', 'binary')),
    protection_class VARCHAR(32) DEFAULT 'server_managed' NOT NULL
        CHECK (protection_class IN ('server_managed')),
    current_version_no INTEGER NOT NULL,
    created_by_subject_id UUID NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    scheduled_destroy_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT pk_secrets PRIMARY KEY (resource_id),
    CONSTRAINT uq_secrets_res_id_project_id UNIQUE (resource_id, project_id),
    CONSTRAINT uq_secrets_project_id_name UNIQUE (project_id, name),
    CONSTRAINT fk_secrets_res_id_resources FOREIGN KEY (resource_id, project_id) REFERENCES core.resources (id, project_id) ON DELETE CASCADE,
    CONSTRAINT fk_secrets_crt_by_subj_id_sub FOREIGN KEY (created_by_subject_id) REFERENCES core.subjects (id) ON DELETE RESTRICT
);

DROP TRIGGER IF EXISTS trg_secrets_set_updated_at ON core.secrets;
CREATE TRIGGER trg_secrets_set_updated_at
BEFORE UPDATE ON core.secrets
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

CREATE INDEX idx_secrets_project_created_at
    ON core.secrets (project_id, created_at DESC);

CREATE INDEX idx_secrets_proj_res_cur_version
    ON core.secrets (project_id, resource_id, current_version_no);

CREATE INDEX idx_secrets_scheduled_destroy_at
    ON core.secrets (scheduled_destroy_at)
    WHERE scheduled_destroy_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS core.secret_versions (
    project_id VARCHAR(12) NOT NULL,
    secret_id VARCHAR(16) NOT NULL,

    version_no INTEGER NOT NULL
        CHECK (version_no > 0),
    state VARCHAR(16) NOT NULL
        CHECK (state IN ('active', 'disabled')),
    payload_kind VARCHAR(16) NOT NULL
        CHECK (payload_kind IN ('text', 'json', 'binary')),
    created_by_subject_id UUID NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    disabled_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT pk_secret_versions PRIMARY KEY (secret_id, version_no),
    CONSTRAINT uq_sec_ver_proj_sec_id_ver_no UNIQUE (project_id, secret_id, version_no),
    CONSTRAINT fk_sec_ver_secret_id_secrets FOREIGN KEY (secret_id, project_id) REFERENCES core.secrets (resource_id, project_id) ON DELETE CASCADE,
    CONSTRAINT fk_sec_ver_crt_by_subj_id_sub FOREIGN KEY (created_by_subject_id) REFERENCES core.subjects (id) ON DELETE RESTRICT
);

DROP TRIGGER IF EXISTS trg_sec_versions_set_updated_at ON core.secret_versions;
CREATE TRIGGER trg_sec_versions_set_updated_at
BEFORE UPDATE ON core.secret_versions
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

CREATE INDEX idx_sec_ver_proj_sec_ver_desc
    ON core.secret_versions (project_id, secret_id, version_no DESC);

CREATE TABLE IF NOT EXISTS core.secret_version_materials (
    project_id VARCHAR(12) NOT NULL,
    secret_id VARCHAR(16) NOT NULL,

    version_no INTEGER NOT NULL
        CHECK (version_no > 0),
    encryption_key_id UUID NOT NULL,
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
    CONSTRAINT fk_sec_ver_mat_sec_id_version FOREIGN KEY (secret_id, version_no) REFERENCES core.secret_versions (secret_id, version_no) ON DELETE CASCADE,
    CONSTRAINT fk_sec_ver_mat_proj_sec_ver FOREIGN KEY (project_id, secret_id, version_no) REFERENCES core.secret_versions (project_id, secret_id, version_no) ON DELETE CASCADE,
    CONSTRAINT fk_sec_ver_mat_enc_key_id FOREIGN KEY (encryption_key_id) REFERENCES core.encryption_keys (id)
);

DROP TRIGGER IF EXISTS trg_sec_ver_mat_set_updated_at ON core.secret_version_materials;
CREATE TRIGGER trg_sec_ver_mat_set_updated_at
BEFORE UPDATE ON core.secret_version_materials
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

CREATE TABLE IF NOT EXISTS core.db_verifiers (
    project_id VARCHAR(12) NOT NULL,
    db_id VARCHAR(16) NOT NULL,
    password_secret_id VARCHAR(16) NOT NULL,

    password_desired_version INTEGER NOT NULL
        CHECK (password_desired_version > 0),
    password_verifier VARCHAR NOT NULL,
    password_desired_state VARCHAR(16) NOT NULL
        CHECK (password_desired_state IN ('present', 'absent')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_db_verifiers PRIMARY KEY (db_id),
    CONSTRAINT fk_db_verifiers_db_id_dbs FOREIGN KEY (db_id) REFERENCES core.dbs (resource_id) ON DELETE CASCADE,
    CONSTRAINT fk_db_vrf_db_id_proj_id_res FOREIGN KEY (db_id, project_id) REFERENCES core.resources (id, project_id) ON DELETE CASCADE,
    CONSTRAINT fk_db_vrf_pwd_sec_id_secrets FOREIGN KEY (password_secret_id, project_id) REFERENCES core.secrets (resource_id, project_id) ON DELETE RESTRICT,
    CONSTRAINT fk_db_vrf_proj_pwd_sec_ver FOREIGN KEY (project_id, password_secret_id, password_desired_version) REFERENCES core.secret_versions (project_id, secret_id, version_no) ON DELETE RESTRICT
);

DROP TRIGGER IF EXISTS trg_db_verifiers_set_updated_at ON core.db_verifiers;
CREATE TRIGGER trg_db_verifiers_set_updated_at
BEFORE UPDATE ON core.db_verifiers
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

CREATE INDEX idx_db_vrf_pwd_secret_id_version
    ON core.db_verifiers (
        project_id,
        password_secret_id,
        password_desired_version
    );

CREATE INDEX idx_db_vrf_project_desired_state
    ON core.db_verifiers (project_id, password_desired_state);

-- TAGS

CREATE TABLE IF NOT EXISTS core.tags (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY,
    project_id VARCHAR(12) NOT NULL,

    tag_key VARCHAR NOT NULL,
    tag_value VARCHAR NOT NULL,
    color VARCHAR,

    is_system BOOLEAN DEFAULT false NOT NULL,
    is_readonly BOOLEAN DEFAULT false NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_tags PRIMARY KEY (id),
    CONSTRAINT fk_tags_project_id_projects FOREIGN KEY (project_id) REFERENCES core.projects (id) ON DELETE CASCADE,
    CONSTRAINT uq_tags_id_project_id UNIQUE (id, project_id),
    CONSTRAINT uq_tags_project_id_tag_kv UNIQUE (project_id, tag_key, tag_value)
);

DROP TRIGGER IF EXISTS trg_tags_set_updated_at ON core.tags;
CREATE TRIGGER trg_tags_set_updated_at
BEFORE UPDATE ON core.tags
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

CREATE TABLE IF NOT EXISTS core.resource_tags (
    tag_id BIGINT NOT NULL,
    project_id VARCHAR(12) NOT NULL,
    resource_id VARCHAR(16) NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    
    CONSTRAINT pk_resource_tags PRIMARY KEY (project_id, resource_id, tag_id),
    CONSTRAINT fk_res_tags_res_id_resources FOREIGN KEY (resource_id, project_id) REFERENCES core.resources (id, project_id) ON DELETE CASCADE,
    CONSTRAINT fk_res_tags_tag_id_tags FOREIGN KEY (tag_id, project_id) REFERENCES core.tags (id, project_id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_resource_tags_set_updated_at ON core.resource_tags;
CREATE TRIGGER trg_resource_tags_set_updated_at
BEFORE UPDATE ON core.resource_tags
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();

CREATE INDEX idx_resource_tags_proj_tag_res
    ON core.resource_tags (project_id, tag_id, resource_id);


WITH updated AS (
    UPDATE core.version_platform
    SET version_num = 'd5f3a62aad85'
    RETURNING core.version_platform.version_num
)
INSERT INTO core.version_platform (version_num)
SELECT 'd5f3a62aad85'
WHERE NOT EXISTS (SELECT 1 FROM updated)
RETURNING core.version_platform.version_num;

COMMIT;
