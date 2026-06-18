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

Routing — `net/http.ServeMux` (`transport/router.go`). `authMiddleware` verifies `Authorization: Bearer <jwt>` via `service.ParseAndVerifyAccessTokenFromAuthHeader` and stores identity in `context` (`runtime.WithAuthIdentity`). Mutations additionally use `requireLiveSessionMiddleware` (live-session check). Organization RBAC — inside the handler via `Authorizer.Authorize` with an `authz.Action`.

## Key flows

**Registration** (`POST /identity/users`). Validation (optional invite code / phone — `IS_INVITE_REQUIRED`/`IS_PHONE_REQUIRED` flags), creates `subjects` + `users` (password stored as a hash). Returns the user.

**Login** (`POST /auth/login`). By `username`/`email` + password: hash check → an `auth_sessions` row is created (refresh token stored hashed), a short-lived access JWT (`ACCESS_TOKEN_TTL_SEC`) is issued, and a refresh token is set in a cookie (name/secure/samesite — env `REFRESH_TOKEN_COOKIE_*`).

**Refresh** (`POST /auth/refresh`). Finds a live session by the refresh cookie, rotates the refresh token (`replaced_by`), issues a new access token. Session lifetime — `ACCESS_SESSION_TTL_SEC`.

**Live session.** The `auth.is_live_session(sid, sub)` function (migrations in `db/migrations/auth/`) checks that the session exists, is not revoked and not expired. It is called by both `apps/auth` (for mutations) and `apps/api` (its `requireLiveSessionMiddleware`) — so the `auth` schema must live in the same DB as the platform.

**Organizations.** `organizations` + `organization_members` with roles (`owner`/`admin`/…); access via RBAC (`authz/rbac.go`), deny-by-default.

## Data model (schema `auth`)

`subjects` (shared actor identifier), `users` (login/email/password hash → subject), `auth_sessions` (refresh sessions: token hash, ip/ua, expires, revoke), `user_invites` (invites), `organizations` + `organization_members`, `version_auth` (migration version). Details — in [db/SCHEMA.md](../../../db/SCHEMA.md).

## Relation to the platform DB

In deployment `auth` and `api` share one PostgreSQL: schema `auth` (this service) and schema `api` (the platform) in one database, with `search_path` covering both. This is required so `apps/api` can call `auth.is_live_session` on its own connection.
