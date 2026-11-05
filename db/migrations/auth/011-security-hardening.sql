-- Password changes invalidate source-bound authorization flows through session revocation.
BEGIN;
SET LOCAL search_path = :"DB_AUTH_SCHEMA_NAME", pg_temp;
ALTER TABLE oidc_auth_requests ADD COLUMN IF NOT EXISTS source_session_id uuid REFERENCES auth_sessions(id) ON DELETE CASCADE;
ALTER TABLE delegation_requests ADD COLUMN IF NOT EXISTS source_session_id uuid REFERENCES auth_sessions(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS ix_oidc_source_session ON oidc_auth_requests(source_session_id);
CREATE INDEX IF NOT EXISTS ix_delegation_source_session ON delegation_requests(source_session_id);

-- Preserve the legacy signature while enforcing the current attester policy.
CREATE OR REPLACE FUNCTION is_live_agent(p_sub uuid, p_host uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = :"DB_AUTH_SCHEMA_NAME", pg_temp AS $$
 SELECT EXISTS (
  SELECT 1 FROM agent_principals d
  JOIN subjects s ON s.id=d.subject_id AND s.kind='agent'
  JOIN platform_clients c ON c.client_id=d.attester_client_id
  WHERE d.subject_id=p_sub AND d.host_id=p_host AND d.revoked_at IS NULL
   AND d.public_key IS NOT NULL AND d.key_thumbprint IS NOT NULL
   AND c.revoked_at IS NULL AND c.can_attest_agent
   AND c.policy @> '{"enabled":true,"can_attest":true,"type":"confidential"}'::jsonb
   AND c.policy->'grant_types' ? 'urn:sb0rka:params:oauth:grant-type:agent'
 );
$$;
CREATE OR REPLACE FUNCTION is_live_agent(p_sub uuid, p_host uuid, p_client text, p_thumbprint text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER
SET search_path = :"DB_AUTH_SCHEMA_NAME", pg_temp AS $$
 SELECT is_live_agent(p_sub,p_host) AND EXISTS (
  SELECT 1 FROM agent_principals d WHERE d.subject_id=p_sub
   AND d.attester_client_id=p_client AND d.key_thumbprint=p_thumbprint
 );
$$;
-- A new overload must not acquire broader EXECUTE rights than the deployed predicate.
DO $$
DECLARE permission record;
BEGIN
 REVOKE EXECUTE ON FUNCTION is_live_agent(uuid,uuid,text,text) FROM PUBLIC;
 FOR permission IN
  SELECT grantee,is_grantable FROM aclexplode(COALESCE(
   (SELECT proacl FROM pg_proc WHERE oid='is_live_agent(uuid,uuid)'::regprocedure),
   acldefault('f',(SELECT proowner FROM pg_proc WHERE oid='is_live_agent(uuid,uuid)'::regprocedure))))
  WHERE privilege_type='EXECUTE'
 LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION %I.is_live_agent(uuid,uuid,text,text) TO %s%s',
   current_schema(), CASE WHEN permission.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(permission.grantee)) END,
   CASE WHEN permission.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
 END LOOP;
END;
$$;
WITH updated AS (UPDATE version_auth SET version_num='security-20261105' RETURNING version_num)
INSERT INTO version_auth(version_num) SELECT 'security-20261105' WHERE NOT EXISTS(SELECT 1 FROM updated);
COMMIT;
