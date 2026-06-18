# RBAC Authorization Model

## Overview

Authorization is implemented as a separate layer behind the `Authorizer` interface (`internal/authz/`). Handlers call `Authorize(subjectID, action, resource)` and receive an `AuthorizationDecision`. No role or membership logic lives in handlers.

The current implementation is `RBACAuthorizer`, backed by `organization_members.role`. The interface is the stable boundary — the backing implementation can be replaced without touching handler code.

## JWT and Role Checks

**JWT does not carry roles.** This is an explicit architectural decision.

The access token contains only identity claims:

```
sub   — subject_id (authorization principal)
sid   — auth_session_id
sk    — subject kind (user / organization)
jti   — token id
iat / exp
```

There is no `role`, `permissions`, `groups`, or resource membership in the JWT.

Role resolution happens at request time:

```
JWT verified (stateless, no DB)
  → sub extracted → subjectID in context
    → handler calls Authorize(subjectID, action, resource)
      → RBACAuthorizer queries organization_members WHERE user_id = subjectID AND organization_id = resource.ID
        → role resolved from DB
          → role checked against rolePermissions matrix
            → allow / deny
```

Why JWT carries no roles:

- Roles are mutable. An org owner can change a member's role at any time. A role embedded in a JWT would be stale until token expiry.
- A single user can have different roles in different organizations. There is no single "role" to embed.
- The JWT TTL is 5 minutes. Even if roles were embedded, they would be wrong for up to 5 minutes after a role change.
- Keeping JWT stateless and free of resource-specific claims allows the token to be verified locally by any service without a DB call, while authorization decisions always reflect current state.

The only use of `sk` (subject kind) from the JWT is routing — determining whether to look up a user profile or organization profile. It is not used for authorization decisions.

## Interface

```go
Authorize(ctx, subjectID, action, resource) -> (*AuthorizationDecision, error)
```

- **Error** is returned only for genuine database failures (maps to HTTP 500).
- **Denial** is expressed via `AuthorizationDecision.Allowed == false` (maps to HTTP 403).
- `ReasonCode` is a machine-readable string for internal logging only. It must never be forwarded to API clients.

## Actions

| Action                           | Value                        |
| -------------------------------- | ---------------------------- |
| `ActionOrganizationRead`         | `organization.read`          |
| `ActionOrganizationUpdate`       | `organization.update`        |
| `ActionOrganizationDelete`       | `organization.delete`        |
| `ActionOrganizationMemberList`   | `organization.member.list`   |
| `ActionOrganizationMemberRead`   | `organization.member.read`   |
| `ActionOrganizationMemberAdd`    | `organization.member.add`    |
| `ActionOrganizationMemberUpdate` | `organization.member.update` |
| `ActionOrganizationMemberRemove` | `organization.member.remove` |

## Roles and Permissions

| Action                       | owner | admin | editor | viewer |
| ---------------------------- | :---: | :---: | :----: | :----: |
| `organization.read`          |   ✓   |   ✓   |   ✓   |   ✓    |
| `organization.update`        |   ✓   |   ✓   |   ✓   |        |
| `organization.delete`        |   ✓   |       |        |        |
| `organization.member.list`   |   ✓   |   ✓   |   ✓   |   ✓    |
| `organization.member.read`   |   ✓   |   ✓   |   ✓   |   ✓    |
| `organization.member.add`    |   ✓   |   ✓   |        |        |
| `organization.member.update` |   ✓   |   ✓   |        |        |
| `organization.member.remove` |   ✓   |   ✓   |        |        |

Roles are stored in `organization_members.role`, enforced by `ck_org_members_role` CHECK constraint in the database.

## Business Invariants (in handlers, not in Authorizer)

The `Authorizer` only answers "does this role allow this action?". Additional business rules are enforced in handlers after authorization passes:

- **AddMember**: if `role == "owner"`, caller must also be `owner`.
- **UpdateMemberRole**: if the target's current role is `owner` or the new role is `owner`, caller must be `owner`. Demoting the last `owner` is blocked.
- **RemoveMember**: if target is `owner`, caller must be `owner`. Removing the last `owner` is blocked.

The last-owner guard queries `ListOrganizationMembers` and counts owners. If `ownerCount <= 1`, the operation is rejected with `409 Conflict`.

## Active User Enforcement

All DB queries that read or mutate user-related data include `AND is_active = true` or equivalent JOIN condition. An inactive user is treated identically to a non-existent user — `ErrUserNotFound` / `ErrOrganizationMemberNotFound` — which maps to 403 at the authorization layer.

`DeactivateUser` atomically sets `is_active = false` and revokes all active sessions in a single transaction, so `requireLiveSessionMiddleware` rejects any subsequent request immediately.

## Reason Codes

| Code                                | Meaning                                   |
| ----------------------------------- | ----------------------------------------- |
| `role_allows_action`                | Decision: allow                           |
| `role_missing_required_permission`  | Role exists but does not have this action |
| `organization_membership_not_found` | Subject is not a member (or is inactive)  |
| `unsupported_resource_type`         | Resource type is not `"organization"`     |
