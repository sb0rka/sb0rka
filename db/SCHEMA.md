# Auth security schema / Схема безопасности Auth

`auth/010-initial_auth_schema.sql` gives `oidc_auth_requests` and `delegation_requests` a nullable `source_session_id` foreign key to `auth_sessions`. Authorization flows bind their initiating session; completion and redemption require a live session owned by the same active user. Requests without this binding cannot be completed. No token/DTO fields change.

Начальная схема сразу привязывает OIDC/delegation requests к исходной сессии. Запрос без привязки завершить нельзя. Смена пароля атомарно отзывает все native/OAuth-сессии; обычное чтение по JWT сохраняет ранее принятый срок до `exp` с учётом skew.

Session issuance, password changes, refresh and authorization exchanges lock the active user first, then requests, sessions and refresh tokens, rechecking state under the locks. Password hashing runs outside transactions. A native login supplies the password hash it verified, preventing an obsolete password proof from creating a session after a password change.

`is_live_agent(uuid,uuid)` remains available and now checks the current attester policy and revocation. `is_live_agent(uuid,uuid,text,text)` additionally binds the token's client and key thumbprint. Both predicates are read-only `SECURITY DEFINER` functions with a fixed auth-schema/`pg_temp` search path and the existing cross-service EXECUTE contract. API roles need schema USAGE and function EXECUTE; broad table write access is unnecessary.

Session binding and the attester checks ship in the initial auth schema. Update Console/CLI to JSON requests before enabling the stricter handlers. Verify every serving replica uses the patched build; a mixed deployment retains the old behavior on old replicas. This task does not apply migrations to the running development database or deploy/restart applications. Keep the additive schema when rolling back application binaries; a rollback to old binaries reopens the audit findings.

## Authentication attempt limits (6 November 2026)

`auth/010-initial_auth_schema.sql` creates `authentication_attempts` with hashed quota keys, bounded counters and an expiry index. Apply that schema **before** starting the patched Auth. The Auth database role needs SELECT/INSERT/UPDATE/DELETE on this table, following the existing schema ownership/privilege setup. No passwords, raw IP addresses or account identifiers are stored in the table. Expired entries are removed in bounded batches.

The counters are atomic across replicas and survive Auth restarts. Login permits 10 attempts per account per 15 minutes and 300 per TCP peer per minute. Username and email aliases share the account's subject quota. Registration permits 30 attempts per peer per hour; current-password verification permits 10 per subject per 15 minutes. Attempts include successful requests, denied requests do not extend their original expiry, and a database failure returns 503 instead of bypassing the limit. Quota failures return 429 with Retry-After. Login and registration/password-change handlers each permit at most four concurrent Argon2 operations.

Peer quotas use the TCP peer address, without trusting arbitrary X-Forwarded-For/X-Real-IP headers. Behind a proxy the peer budget is shared by that proxy's users; a production gateway must be configured accordingly.

Identity JSON requests are capped at 16 KiB and reject extra documents, invalid UTF-8 and unknown fields. Oversized passwords are rejected rather than truncated; whitespace is now part of the password. Existing hashes created by the former TrimSpace behavior still correspond to their previously stored, trimmed password, which cannot be reconstructed with the original surrounding whitespace. JWTs produced by Auth retain their normal wire format; ambiguous duplicate claims, numeric-string timestamps and noncanonical/truncated signatures are rejected by the verifiers.
