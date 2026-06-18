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
| `POST /auth/logout` | Log out (revoke the session) |
| `GET /auth/subject` | Current subject from the token |
| `GET /auth/sessions`, `DELETE /auth/sessions[/{id}]` | List/revoke sessions |
| `GET/PATCH/DELETE /identity/users/current` | Current user profile |
| `GET/POST/PATCH /identity/organizations[...]` | Organizations |

## Configuration (env)

| Variable | Default | Purpose |
| --- | --- | --- |
| `SERVER_ADDR` / `SERVER_PORT` | `localhost` / `8020` | address and port |
| `DATABASE_URI` | `postgres://…/auth` | DB connection (schema `auth`) |
| `ACCESS_TOKEN_PRIVATE_KEY` / `…_FILE_PATH` | — | Ed25519 signing key (shared with `api`) |
| `ACCESS_TOKEN_ISSUER` / `…_AUDIENCE` / `…_KID` | `auth.local` / `api.local` / `ed25519-v1` | token claims |
| `ACCESS_TOKEN_TTL_SEC` / `ACCESS_SESSION_TTL_SEC` | `300` / `604800` | access token and session TTL |
| `REFRESH_TOKEN_COOKIE_*` | see `.env.sample` | refresh cookie name/secure/samesite |
| `IS_INVITE_REQUIRED` / `IS_PHONE_REQUIRED` | `false` / `false` | require invite code / phone on registration |
