---
title: "Platform API Architecture"
description: "Layers, request lifecycle and key flows of the apps/api service: authentication, RBAC, database creation, secret encryption and garbage collection."
---

A map of `apps/api` for developers and coding agents — context that can't be inferred from a single file. For the database structure see [`db/SCHEMA.md`](../../../db/SCHEMA.md); for the endpoint contract see the Swagger UI (`/swagger`).

## Layers

Dependencies point strictly downward and are never mixed:

```
transport/  (HTTP: router, middleware, per-domain handlers)
   ↓ interfaces
service/    (business logic, validation, crypto)
   ↓ store/db.Database interface
store/db/   (pgx, the single door to PostgreSQL)
   ↓
domain/model/ (domain structs)
```

Layers are decoupled via interfaces collected into `runtime.Dependencies` (`transport/runtime/deps.go`) and injected into every handler:

- `store/db.Database` — database access (`PsqlDB` impl);
- `authz.Authorizer` — RBAC (`RBACAuthorizer` impl);
- `service.SecretCrypto` — secret encryption (`TinkAEADSecretCrypto` impl);
- `telemetry.Service` — metrics from Prometheus.

Everything is wired in `cmd/api/main.go` (`serverCMD`) and passed to `transport.NewServer`.

## Request lifecycle

Routing is the standard `net/http.ServeMux` (Go 1.22 patterns like `GET /projects/{project_id}`) in `transport/router.go`. Outer middleware (shared by all): `loggerMiddleware → corsMiddleware → panicMiddleware`.

Two access wrappers:
- `authOnly` = `authMiddleware` (JWT verification) — for reads;
- `authLive` = `authMiddleware` + `requireLiveSessionMiddleware` (live session) — for mutations.

A typical handler (reference: `transport/projects/handlers.go`):

```
1. parseSubjectID / extractSubjectIdentity   — who (from context)
2. parsePathID                                — path params
3. h.authorize(... authz.ActionXxx ...)       — allowed? (RBAC)
4. decode body (DisallowUnknownFields)        — strict body parsing
5. service.Validate… / Normalize…             — input validation
6. h.deps.PlatformDatabase.…                  — DB call
7. errors.Is(err, db.ErrXxx) → HTTP code       — store error mapping
8. toX(model) → contract.XResponse            — map to outgoing DTO
```

Request/response JSON shapes live in `packages/contract` (shared with the `s0c` CLI) — the single source of truth for the contract. `model → contract` mapping is done by `toX` functions in the handler.

## Identity: the JWT → context bridge

`authMiddleware` (`transport/middlewares.go`) verifies `Authorization: Bearer <jwt>` via `service.ParseAndVerifyAccessTokenFromAuthHeader` (Ed25519/EdDSA, claims `sub`/`sid`/`sk`/`jti`) and stores identity in `context` via `runtime.WithAuthIdentity`. Handlers then read it through `runtime.AuthSubjectIDFromContext` etc. `apps/api` itself does **not** issue tokens — `apps/auth` does.

`requireLiveSessionMiddleware` (for mutations) calls `auth.is_live_session()` in the DB — the function and sessions are provided by `apps/auth`.

## RBAC

Deny-by-default (`authz/`). `RBACAuthorizer.Authorize` looks up the subject's project role (`project_members`) and the `rolePermissions` matrix (`authz/rbac.go`): roles `owner`/`admin`/`editor`/`viewer` × `authz.Action` actions. Any unknown resource type or non-member → deny. A new action = an `Action` constant (`authorizer.go`) + an entry in the matrix for the relevant roles. Business invariants on top of RBAC (e.g. "can't remove the last owner") live in the handler.

## Flow: database creation

The most complex multi-entity flow (`transport/dbis/handlers.go` `CreateDBInstance` → `store/db.CreateDatabase`):

1. Auth + RBAC (`ActionDBCreate`), name validation (`NormalizeDatabaseName` → lowercase/`_`), quota check (`AssertCanCreateResourceWithType`).
2. `GenerateAlphaNumPassword` — the database password (exists in plaintext only here, in request memory).
3. `GenerateResourceID` for the database and for its password secret.
4. `GetActiveEncryptionKey` → the active key from `encryption_keys`.
5. `BuildSecretAAD(projectID, secretID, version=1, server_managed)` → AAD.
6. `SecretCrypto.Encrypt(password, aad, key.KeyRef)` → ciphertext.
7. `GeneratePostgresSCRAMSHA256Verifier(password)` → SCRAM verifier (what Postgres itself stores).
8. `CreateDatabase(params)` — **one transaction** creating a consistent set: `dbis` + `resource_states` (database), `secrets` (name `DATABASE_<id>_PASSWORD`) + `secret_versions` v1 + `secret_version_materials` (envelope), `dbi_verifiers` (verifier + `password_secret_id`, desired=`present`), and the system tag `db_secret` (`resource_tags`).

Result: the password is never stored in plaintext — only the encrypted material + SCRAM verifier. The real PostgreSQL instance is provisioned by an external orchestrator from desired state (not present in this repository).

## Secret encryption

`service/secret_crypto.go`: Tink **AEAD** (AES-256-GCM), envelope. The key invariant is **AAD**: `BuildSecretAAD` binds the ciphertext to `purpose/project_id/secret_id/version_no/protection_class`. On decryption the AAD must match byte-for-byte or Tink refuses — this prevents swapping/relocating ciphertext between secrets/versions. The key material (Tink keyset) lives outside the DB (env/file); `encryption_keys` holds only metadata (`provider`/`key_ref`/`status`). The DB `key_ref` resolves to a primitive via `TinkKeysetResolver`.

## Desired vs runtime state + GC

Desired and actual state are separated across the schema:
- desired state is written by the API (`dbis.desired_runtime_state`, `dbi_verifiers.password_desired_state`);
- actual state is reconciled by an external reconciler (`resource_states.runtime_state`).

`apps/drones` (background GC) ticks and calls the SQL function `api.cleanup_one_deleted_dbi()` (`SECURITY DEFINER`, `SKIP LOCKED` — safe for multiple workers). It cleans deleted databases one at a time: once the database is `desired_runtime_state='terminated'`, both the database and its password secret are `runtime_state='deleted'`, and `password_desired_state='absent'`, it deletes the database resource, the secret resource and the `db_secret` system tag in one transaction.

## Critical security invariants

- Never log plaintext secrets/passwords; reveal responses carry `Cache-Control: no-store`.
- AAD must match between encryption and decryption.
- RBAC is deny-by-default; a new action requires a matrix entry.
- In the platform DB the database password is stored only encrypted + as a SCRAM verifier.
