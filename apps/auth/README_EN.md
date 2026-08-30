# auth

Auth API for the Sb0rka platform: user registration and authentication, JWT issuance, refresh sessions, organizations.

English | [Русский](README.md)

Signs short-lived access tokens (Ed25519) that `apps/api` verifies with the same key. Internals — [docs/architecture_en.md](docs/architecture_en.md). Database schema — [db/SCHEMA.md](../../db/SCHEMA.md).

## Run

```bash
go run ./apps/auth/cmd/auth server
```

Build: `go build -o bin/auth ./apps/auth/cmd/auth`. Local stack — `docker-compose.dev.yml` (see the `.claude/skills/local-dev` skill).

## Commands

| Command | Purpose |
| --- | --- |
| `server` | Run the HTTP server |
| `token` | Generate the token-signing private key |
| `version` | Print version |

## Endpoints (main)

| Method and path | Purpose |
| --- | --- |
| `POST /identity/users` | Register a user |
| `POST /auth/login` | Login → `access_token` + refresh cookie |
| `POST /auth/refresh` | Refresh the access token via the refresh cookie |
| `POST /auth/agent-tokens/investigation` | Issue an investigation-scoped JWT for remote MCP |
| `POST /auth/agent-tokens/exchange` | Internal agent-to-access token exchange for `ir-api` |
| `POST /auth/logout` | Log out (revoke the session) |
| `GET /auth/subject` | Current subject from the token |
| `GET /auth/sessions`, `DELETE /auth/sessions[/{id}]` | List/revoke sessions |
| `GET/PATCH/DELETE /identity/users/current` | Current user profile |
| `GET/POST/PATCH /identity/organizations[...]` | Organizations |
| `GET /.well-known/openid-configuration`, `GET /oauth2/jwks` | OIDC discovery/JWKS when the full OIDC configuration is present |
| `GET /oauth2/authorize`, `POST /oauth2/token`, `POST /oauth2/revoke` | OIDC authorization code + PKCE, refresh rotation, and revoke for the configured client |

## Configuration (env)

| Variable | Default | Purpose |
| --- | --- | --- |
| `SERVER_ADDR` / `SERVER_PORT` | `localhost` / `8020` | address and port |
| `DATABASE_URI` | `postgres://…/auth` | DB connection (schema `auth`) |
| `PLATFORM_API_BASE_URL` | — | Platform API used to check project membership before issuing an agent JWT |
| `INVESTIGATION_AGENT_EXCHANGE_CLIENT_ID` / `…_CLIENT_SECRET` | — | confidential `ir-api` client for the backend-only exchange; both are required together and the secret is at least 32 bytes |
| `ACCESS_TOKEN_PRIVATE_KEY` / `…_FILE_PATH` | — | Ed25519 signing key (shared with `api`) |
| `ACCESS_TOKEN_ISSUER` / `…_AUDIENCE` / `…_KID` | `auth.local` / `api.local` / `ed25519-v1` | token claims |
| `ACCESS_TOKEN_TTL_SEC` / `ACCESS_SESSION_TTL_SEC` | `300` / `604800` | access token and session TTL |
| `REFRESH_TOKEN_COOKIE_*` | `__Host-refresh_token`, secure, path `/`, host-only, httpOnly, lax | refresh-cookie settings; the `__Host-` contract is validated at startup |
| `IS_PHONE_REQUIRED` | `false` | require phone on registration |
| `OIDC_ISSUER` / `OIDC_LOGIN_URL` | — | canonical issuer and community console login URL |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_REDIRECT_URIS` | — | configurable confidential client, its secret, and exact callback URIs |
| `OIDC_SIGNING_PRIVATE_KEY_FILE_PATH` / `OIDC_SIGNING_KID` | — | path to an RSA PKCS#8 PEM key and its `kid` for RS256 ID tokens |
| `OIDC_PROVIDER_CRYPTO_KEY_FILE_PATH` | — | path to a file containing the 32-byte AES-GCM key for authorization request/code envelopes |
| `OIDC_CODE_HMAC_KEY_FILE_PATH` | — | path to a separate file containing an HMAC key of at least 32 bytes for authorization-code hashes |

OIDC is enabled only by a complete variable set; partial configuration stops startup. The client secret comes from env; all other key material is file-only. `OIDC_ALLOW_INSECURE_HTTP_ISSUER=true` is allowed only for loopback/private-network development issuers.
