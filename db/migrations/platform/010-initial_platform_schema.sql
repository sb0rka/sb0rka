-- Migration: d5f3a62aad85

BEGIN;

-- FUNCTIONS

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION core.gen_project_id()
RETURNS varchar(10)
LANGUAGE sql
VOLATILE
AS $$
    SELECT encode(gen_random_bytes(5), 'hex');
$$;

CREATE OR REPLACE FUNCTION core.gen_resource_id()
RETURNS varchar(12)
LANGUAGE sql
VOLATILE
AS $$
    SELECT encode(gen_random_bytes(6), 'hex');
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

CREATE TABLE IF NOT EXISTS core.organizations (
    id UUID NOT NULL,
    name VARCHAR NOT NULL,
    description VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_organizations PRIMARY KEY (id),
    CONSTRAINT fk_organizations_id_subjects FOREIGN KEY (id) REFERENCES core.subjects (id) ON DELETE CASCADE
);

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

CREATE INDEX idx_organization_members_organization_id
ON core.organization_members(organization_id);

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

CREATE INDEX idx_plans_kind
ON core.plans(kind);


CREATE TABLE IF NOT EXISTS core.subject_plans (
    subject_id UUID NOT NULL,
    plan_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_subject_plans PRIMARY KEY (subject_id),
    CONSTRAINT fk_subject_plans_plan_id_plans FOREIGN KEY (plan_id) REFERENCES core.plans (id),
    CONSTRAINT fk_subject_plans_subject_id_subjects FOREIGN KEY (subject_id) REFERENCES core.subjects (id) ON DELETE CASCADE
    
);

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

CREATE INDEX idx_quota_definitions_scope
ON core.quota_definitions(scope);

CREATE TABLE IF NOT EXISTS core.plan_quotas (
    plan_id UUID NOT NULL,
    quota_definition_id UUID NOT NULL,
    limit_value BIGINT NOT NULL
        CHECK (limit_value >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_plan_quotas PRIMARY KEY (plan_id, quota_definition_id),
    CONSTRAINT fk_plan_quotas_plan_id_plans FOREIGN KEY (plan_id) REFERENCES core.plans (id),
    CONSTRAINT fk_plan_quotas_quota_def_id_quota_defs FOREIGN KEY (quota_definition_id) REFERENCES core.quota_definitions (id) ON DELETE CASCADE
);

CREATE INDEX idx_plan_quotas_quota_definition_id
ON core.plan_quotas (quota_definition_id);

-- PROJECTS

CREATE TABLE IF NOT EXISTS core.projects (
    id VARCHAR(10) DEFAULT core.gen_project_id() NOT NULL,
    plan_id UUID NOT NULL,
    owner_subject_id UUID NOT NULL,
    billing_subject_id UUID NOT NULL,
    name VARCHAR NOT NULL,
    description VARCHAR,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_projects PRIMARY KEY (id),
    CONSTRAINT ck_projects_ck_proj_id_hex CHECK (id ~ '^[0-9a-f]{10}$'), 
    CONSTRAINT uq_projects_owner_subject_id_name UNIQUE (owner_subject_id, name),
    CONSTRAINT fk_projects_plan_id_plans FOREIGN KEY (plan_id) REFERENCES core.plans (id) ON DELETE CASCADE,
    CONSTRAINT fk_projects_owner_subject_id_subjects FOREIGN KEY (owner_subject_id) REFERENCES core.subjects (id) ON DELETE CASCADE,
    CONSTRAINT fk_projects_billing_subject_id_subjects FOREIGN KEY (billing_subject_id) REFERENCES core.subjects (id) ON DELETE CASCADE
);

CREATE INDEX idx_projects_billing_subject_id
ON core.projects(billing_subject_id);

CREATE INDEX idx_projects_owner_active_only
ON core.projects(owner_subject_id)
WHERE is_active = true;

CREATE TABLE IF NOT EXISTS core.project_members (
    project_id VARCHAR(10) NOT NULL,
    subject_id UUID NOT NULL,
    role VARCHAR(8) NOT NULL
        CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_project_members PRIMARY KEY (project_id, subject_id),
    CONSTRAINT fk_project_members_project_id_projects FOREIGN KEY (project_id) REFERENCES core.projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_project_members_subject_id_subjects FOREIGN KEY (subject_id) REFERENCES core.subjects (id) ON DELETE CASCADE
);

CREATE INDEX idx_project_members_subject_id 
ON core.project_members(subject_id);

-- RESOURCES

CREATE TABLE IF NOT EXISTS core.resources (
    id VARCHAR(12) DEFAULT core.gen_resource_id() NOT NULL,
    project_id VARCHAR(10) NOT NULL,
    kind VARCHAR(16) NOT NULL
        CHECK (kind IN ('database', 'secret')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_resources PRIMARY KEY (id),
    CONSTRAINT ck_resources_ck_res_id_hex CHECK (id ~ '^[0-9a-f]{12}$'), 
    CONSTRAINT fk_resources_proj_id_projects FOREIGN KEY (project_id) REFERENCES core.projects (id) ON DELETE CASCADE,
    CONSTRAINT uq_resources_id_project_id UNIQUE (id, project_id),
    CONSTRAINT uq_resources_id_project_kind UNIQUE (id, project_id, kind)
);

CREATE INDEX idx_resources_project_kind
ON core.resources (project_id, kind);

CREATE INDEX idx_resources_project_created_at
ON core.resources (project_id, created_at);

CREATE TABLE IF NOT EXISTS core.resource_states (
    project_id VARCHAR(10) NOT NULL,
    resource_id VARCHAR(12) NOT NULL,
    runtime_state VARCHAR(16) NOT NULL
        CHECK (runtime_state IN ('syncing', 'creating', 'available', 'stopping', 'stopped', 'starting', 'deleting', 'deleted', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT pk_resource_states PRIMARY KEY (resource_id),
    CONSTRAINT fk_resource_states_resource FOREIGN KEY (resource_id, project_id) REFERENCES core.resources (id, project_id) ON DELETE CASCADE
);

CREATE INDEX idx_resource_states_project_runtime_state
ON core.resource_states (project_id, runtime_state);

CREATE TABLE IF NOT EXISTS core.tags (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY,
    project_id VARCHAR(10) NOT NULL,
    tag_key VARCHAR NOT NULL,
    tag_value VARCHAR NOT NULL,
    color VARCHAR,
    is_system BOOLEAN DEFAULT false NOT NULL,
    is_readonly BOOLEAN DEFAULT false NOT NULL,
    CONSTRAINT pk_tags PRIMARY KEY (id),
    CONSTRAINT fk_tags_project_id_projects FOREIGN KEY (project_id) REFERENCES core.projects (id) ON DELETE CASCADE,
    CONSTRAINT uq_tags_id_project_id UNIQUE (id, project_id),
    CONSTRAINT uq_tags_proj_id_tag_key_tag_value UNIQUE (project_id, tag_key, tag_value)
);

CREATE TABLE IF NOT EXISTS core.resource_tags (
    tag_id BIGINT NOT NULL,
    project_id VARCHAR(10) NOT NULL,
    resource_id VARCHAR(12) NOT NULL,
    CONSTRAINT pk_resource_tags PRIMARY KEY (project_id, resource_id, tag_id),
    CONSTRAINT fk_resource_tags_res_id_resources FOREIGN KEY (resource_id, project_id) REFERENCES core.resources (id, project_id) ON DELETE CASCADE,
    CONSTRAINT fk_resource_tags_tag_id_tags FOREIGN KEY (tag_id, project_id) REFERENCES core.tags (id, project_id) ON DELETE CASCADE
);

CREATE INDEX idx_resource_tags_project_tag
ON core.resource_tags (project_id, tag_id, resource_id);

CREATE TABLE IF NOT EXISTS core.secrets (
    project_id VARCHAR(10) NOT NULL,
    resource_id VARCHAR(12) NOT NULL,
    name VARCHAR NOT NULL,
    description VARCHAR,
    encrypted_value VARCHAR NOT NULL,
    version INTEGER DEFAULT 1 NOT NULL,
    revealed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT pk_secrets PRIMARY KEY (resource_id),
    CONSTRAINT fk_secrets_res_id_resources FOREIGN KEY (resource_id) REFERENCES core.resources (id) ON DELETE CASCADE,
    CONSTRAINT fk_secrets_res_id_proj_id_resources FOREIGN KEY (resource_id, project_id) REFERENCES core.resources (id, project_id) ON DELETE CASCADE,
    CONSTRAINT uq_secrets_proj_id_name UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS core.dbs (
    project_id VARCHAR(10) NOT NULL,
    resource_id VARCHAR(12) NOT NULL,
    name VARCHAR NOT NULL,
    normalized_name VARCHAR NOT NULL,
    desired_runtime_state VARCHAR(16) NOT NULL
        CHECK (desired_runtime_state IN ('running', 'suspended', 'terminated')),
    description VARCHAR,
    CONSTRAINT pk_dbs PRIMARY KEY (resource_id),
    CONSTRAINT fk_dbs_res_id_resources FOREIGN KEY (resource_id) REFERENCES core.resources (id) ON DELETE CASCADE,
    CONSTRAINT fk_dbs_res_id_proj_id_resources FOREIGN KEY (resource_id, project_id) REFERENCES core.resources (id, project_id) ON DELETE CASCADE,
    CONSTRAINT uq_dbs_proj_id_normalized_name UNIQUE (project_id, normalized_name)
);

CREATE TABLE IF NOT EXISTS core.db_verifiers (
    project_id VARCHAR(10) NOT NULL,
    db_id VARCHAR(12) NOT NULL,
    password_secret_id VARCHAR(12) NOT NULL,
    password_verifier VARCHAR NOT NULL,
    password_desired_version INTEGER NOT NULL,
    password_desired_state VARCHAR(16) NOT NULL
        CHECK (password_desired_state IN ('present', 'absent')),
    CONSTRAINT pk_db_verifiers PRIMARY KEY (db_id),
    CONSTRAINT fk_db_verifiers_db_id_dbs FOREIGN KEY (db_id) REFERENCES core.dbs (resource_id) ON DELETE CASCADE,
    CONSTRAINT fk_db_verifiers_password_secret_id_secrets FOREIGN KEY (password_secret_id) REFERENCES core.secrets (resource_id) ON DELETE CASCADE,
    CONSTRAINT fk_db_verifiers_db_id_project_id_resources FOREIGN KEY (db_id, project_id) REFERENCES core.resources (id, project_id) ON DELETE CASCADE,
    CONSTRAINT fk_db_verifiers_pass_sec_id_proj_id_resources FOREIGN KEY (password_secret_id, project_id) REFERENCES core.resources (id, project_id) ON DELETE CASCADE
);

CREATE INDEX idx_db_verifiers_project_id
ON core.db_verifiers (project_id);

CREATE INDEX idx_db_verifiers_password_secret_id
ON core.db_verifiers (password_secret_id);


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
