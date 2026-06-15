-- Migration: b8227e6e851a

BEGIN;

SET LOCAL search_path = :"DB_AUTH_SCHEMA_NAME", pg_temp;

ALTER TABLE subjects
    DROP CONSTRAINT IF EXISTS subjects_kind_check;

ALTER TABLE subjects
    ADD CONSTRAINT subjects_kind_check CHECK (kind IN ('user', 'organization'));

CREATE TABLE IF NOT EXISTS organizations (
    id UUID NOT NULL,

    name VARCHAR NOT NULL,
    description VARCHAR,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_organizations PRIMARY KEY (id),
    CONSTRAINT fk_organizations_id_subjects FOREIGN KEY (id) REFERENCES subjects (id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_orgs_set_updated_at ON organizations;
CREATE TRIGGER trg_orgs_set_updated_at
BEFORE UPDATE ON organizations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS organization_members (
    user_id UUID NOT NULL,
    organization_id UUID NOT NULL,

    role VARCHAR(6) NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT pk_organization_members PRIMARY KEY (user_id, organization_id),
    CONSTRAINT fk_org_members_org_id_orgs FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT fk_org_members_user_id_users FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT ck_org_members_role CHECK (role IN ('owner', 'admin', 'editor', 'viewer'))
);

DROP TRIGGER IF EXISTS trg_org_members_set_updated_at ON organization_members;
CREATE TRIGGER trg_org_members_set_updated_at
BEFORE UPDATE ON organization_members
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS ix_org_members_org_id ON organization_members (organization_id);

UPDATE version_auth SET version_num = 'b8227e6e851a' RETURNING version_num;

COMMIT;
