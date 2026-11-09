BEGIN;

SET LOCAL search_path = :"DB_AUTH_SCHEMA_NAME", pg_temp;

-- Public client registry.

INSERT INTO subjects (id, kind)
VALUES
    ('00000000-0000-4000-8000-000000000001', 'service'),
    ('00000000-0000-4000-8000-000000000002', 'service')
ON CONFLICT (id) DO NOTHING;

INSERT INTO service_principals (subject_id, name)
VALUES
    ('00000000-0000-4000-8000-000000000001', 'som-service'),
    ('00000000-0000-4000-8000-000000000002', 'ir-service')
ON CONFLICT (name) DO NOTHING;

INSERT INTO platform_clients (client_id, actor_subject_id, can_delegate, can_attest_agent, policy)
VALUES
    (
        'sb0rka-console',
        NULL,
        false,
        false,
        $policy${
            "client_id": "sb0rka-console",
            "name": "Console",
            "enabled": true,
            "type": "internal",
            "access_audience": "sb0rka-api",
            "service_actor": "",
            "grant_types": [],
            "redirect_uris": [],
            "oidc_scopes": [],
            "delegation_policies": {},
            "introspection_audiences": [],
            "can_attest": false
        }$policy$::jsonb
    ),
    (
        'sb0rka-consent',
        NULL,
        false,
        false,
        $policy${
            "client_id": "sb0rka-consent",
            "name": "Auth consent",
            "enabled": true,
            "type": "internal",
            "access_audience": "sb0rka-api",
            "service_actor": "",
            "grant_types": [],
            "redirect_uris": [],
            "oidc_scopes": [],
            "delegation_policies": {},
            "introspection_audiences": [],
            "can_attest": false
        }$policy$::jsonb
    ),
    (
        'sb0rka-som-web',
        (SELECT subject_id FROM service_principals WHERE name = 'som-service'),
        true,
        false,
        $policy${
            "client_id": "sb0rka-som-web",
            "name": "SoM",
            "enabled": true,
            "type": "confidential",
            "secret_env": "SB0RKA_SOM_WEB_CLIENT_SECRET",
            "access_audience": "sb0rka-som",
            "service_actor": "som-service",
            "grant_types": [
                "authorization_code",
                "refresh_token",
                "urn:ietf:params:oauth:grant-type:token-exchange",
                "urn:sb0rka:params:oauth:grant-type:delegation"
            ],
            "redirect_uris": ["https://api.som.internal/v1/oauth/sb0rka/callback"],
            "oidc_scopes": ["openid", "profile", "email", "offline_access"],
            "delegation_policies": {
                "sb0rka-api": ["projects.read", "resources.read", "secrets.create", "secrets.write"]
            },
            "introspection_audiences": ["sb0rka-som"],
            "can_attest": false
        }$policy$::jsonb
    ),
    (
        'sb0rka-ir-web',
        (SELECT subject_id FROM service_principals WHERE name = 'ir-service'),
        true,
        false,
        $policy${
            "client_id": "sb0rka-ir-web",
            "name": "IR",
            "enabled": true,
            "type": "confidential",
            "secret_env": "SB0RKA_IR_WEB_CLIENT_SECRET",
            "access_audience": "sb0rka-ir",
            "service_actor": "ir-service",
            "grant_types": [
                "authorization_code",
                "refresh_token",
                "urn:ietf:params:oauth:grant-type:token-exchange",
                "urn:sb0rka:params:oauth:grant-type:delegation"
            ],
            "redirect_uris": [
                "http://localhost:8090/api/v1/auth/oidc/callback",
                "http://localhost:8090/api/v1/integrations/platform/callback",
                "http://localhost:8090/api/v1/integrations/gateway/callback"
            ],
            "oidc_scopes": ["openid", "profile", "email", "offline_access"],
            "delegation_policies": {
                "sb0rka-api": ["projects.read", "resources.read", "secrets.read", "secrets.reveal", "secrets.create", "secrets.write"],
                "sb0rka-ir-gateway": ["ir.gateway.use"]
            },
            "introspection_audiences": ["sb0rka-ir"],
            "can_attest": false
        }$policy$::jsonb
    ),
    (
        'sb0rka-som-workload',
        (SELECT subject_id FROM service_principals WHERE name = 'som-service'),
        false,
        true,
        $policy${
            "client_id": "sb0rka-som-workload",
            "name": "SoM workload",
            "enabled": true,
            "type": "confidential",
            "secret_env": "SB0RKA_SOM_WORKLOAD_CLIENT_SECRET",
            "attestation_secret_env": "SB0RKA_SOM_ATTESTATION_SECRET",
            "access_audience": "",
            "service_actor": "som-service",
            "grant_types": ["urn:sb0rka:params:oauth:grant-type:agent"],
            "redirect_uris": [],
            "oidc_scopes": [],
            "delegation_policies": {},
            "introspection_audiences": [],
            "can_attest": true,
            "attestation_consume_url": "https://api.som.internal/v1/agent/auth/attestations/consume"
        }$policy$::jsonb
    ),
    (
        'sb0rka-ir-gateway',
        NULL,
        false,
        false,
        $policy${
            "client_id": "sb0rka-ir-gateway",
            "name": "IR Gateway",
            "enabled": true,
            "type": "confidential",
            "secret_env": "SB0RKA_IR_GATEWAY_CLIENT_SECRET",
            "access_audience": "",
            "service_actor": "",
            "grant_types": [],
            "redirect_uris": [],
            "oidc_scopes": [],
            "delegation_policies": {},
            "introspection_audiences": ["sb0rka-ir-gateway"],
            "can_attest": false
        }$policy$::jsonb
    )
ON CONFLICT (client_id) DO NOTHING;

COMMIT;
