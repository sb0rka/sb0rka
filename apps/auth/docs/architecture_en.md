---
title: "Auth API Architecture"
description: "Layers, flows and data model of apps/auth: registration, login, refresh sessions, live-session check, organization RBAC."
---

A document for developers and coding agents. System overview — in the [root ARCHITECTURE.md](../../../ARCHITECTURE.md). Database structure — in [db/SCHEMA.md](../../../db/SCHEMA.md).

## Layers

Same layering as `apps/api`, dependencies point downward:

```
transport/  (HTTP: router, middleware, auth/users/organizations handlers)
   ↓ interfaces
service/    (business logic, validation, password hashing, token issuance)
   ↓ store/db.Database interface
store/db/   (pgx, the single door to PostgreSQL)
   ↓
domain/model/ (subjects, users, sessions, organizations)
```

`apps/auth` signs access tokens with a private Ed25519 key; `apps/api` verifies them with the **same key** (shared `ACCESS_TOKEN_PRIVATE_KEY`, matching `issuer/audience/kid`).

## Request lifecycle

Routing — `net/http.ServeMux` (`transport/router.go`). `authMiddleware` verifies `Authorization: Bearer <jwt>` via `service.ParseAndVerifyAccessTokenFromAuthHeader` and stores identity in the standard `authctx`. Mutations additionally use `requireLiveSessionMiddleware` (live-session check). Private modules may explicitly select `route.OptionalBrowserSession`; only those routes attempt authentication with the existing refresh cookie, while a missing cookie continues anonymously. An unknown access mode aborts service startup.

## Key flows

**Registration** (`POST /identity/users`). Validation (optional phone — `IS_PHONE_REQUIRED` flag), creates `subjects` + `users` (password stored as a hash). Returns the user.

**Login** (`POST /auth/login`). By `username`/`email` + password: hash check → an `auth_sessions` row is created (refresh token stored hashed), a short-lived access JWT (`ACCESS_TOKEN_TTL_SEC`) is issued, and a refresh token is set in a cookie (name/secure/samesite — env `REFRESH_TOKEN_COOKIE_*`).

**Refresh** (`POST /auth/refresh`). Finds a live session by the refresh cookie, rotates the refresh token (`replaced_by`), issues a new access token. Session lifetime — `ACCESS_SESSION_TTL_SEC`.

**Optional browser session (private opt-in).** The middleware validates and hashes the configured refresh cookie, then resolves a current live session for an active user in one read-only query. It takes no locks, changes no rows, performs no rotation, and does not accept a Bearer token in place of the cookie. `replaced_by` history must be retained for at least the family lifetime: walking it backwards supplies the stable `auth_time` of the family's first session, while the handler receives only `subject_id`, `subject_kind=user`, the current `session_id`, and that time. A missing, malformed, expired, or revoked cookie leaves the request anonymous so the protocol handler can choose its own redirect or rejection.

The production cookie defaults to `__Host-refresh_token` with an empty `Domain`, `Secure=true`, `Path=/`, `HttpOnly=true`, and `SameSite=Lax`. Configuration incompatible with the `__Host-` prefix is rejected at startup; local HTTP development can use a cookie without that prefix.

**Live session.** The `auth.is_live_session(sid, sub)` function (migrations in `db/migrations/auth/`) checks that the session exists, is not revoked and not expired. It is called by both `apps/auth` (for mutations) and `apps/api` (its `requireLiveSessionMiddleware`) — so the `auth` schema must live in the same DB as the platform.

**Organizations.** `organizations` + `organization_members` with roles (`owner`/`admin`/…); access via RBAC (`authz/rbac.go`), deny-by-default.

## Data model (schema `auth`)

`subjects` (shared actor identifier), `users` (login/email/password hash → subject), `auth_sessions` (refresh sessions: token hash, ip/ua, expires, revoke), `organizations` + `organization_members`, `version_auth` (migration version). Details — in [db/SCHEMA.md](../../../db/SCHEMA.md).

## Relation to the platform DB

In deployment `auth` and `api` share one PostgreSQL: schema `auth` (this service) and schema `api` (the platform) in one database, with `search_path` covering both. This is required so `apps/api` can call `auth.is_live_session` on its own connection.
