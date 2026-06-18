---
title: "Authentication & access"
description: "The Platform API uses Bearer tokens for authentication and a project-level role model for access control. This page covers tokens, live sessions and the role permission matrix."
---

## Access token

Every request to a protected endpoint must include:

```http
Authorization: Bearer <access_token>
```

The token is a short-lived JWT issued by Sb0rka's authentication service after sign-in. The Platform API does not issue tokens — it only verifies the signature and expiry. The token is used as an **identity token**: it provides the user id (`sub`), session (`sid`), subject kind (`sk`) and token id (`jti`).

When the token expires, obtain a new one through the authentication service (session refresh). The console and CLI do this automatically.

### v0.1.0 limitations

- Only `user` subjects are supported.
- Delegated (acting-as) access is not supported.
- A project's billing subject is always its owner.

## Live session

Some endpoints are marked as requiring a **live session** — these are all data-changing operations (create, update, delete, secret reveal). In addition to a valid token, the platform verifies that the session is still active and not revoked.

Read-only operations require only a valid token.

In the [reference](reference) such endpoints are marked **live**.

## Roles & permissions

Access is checked by project membership. Each member has a single role:

| Role | Purpose |
| --- | --- |
| `owner` | full control, including project deletion, plan changes and owner management |
| `admin` | manage resources and members (except owners) |
| `editor` | create and modify resources, no member management |
| `viewer` | read-only, including secret reveal |

### Permission matrix

Each API action maps to a permission. Availability by role:

| Action | owner | admin | editor | viewer |
| --- | :---: | :---: | :---: | :---: |
| View project | ✅ | ✅ | ✅ | ✅ |
| Update project metadata | ✅ | ✅ | ✅ | — |
| Delete project | ✅ | — | — | — |
| Change plan / billing | ✅ | — | — | — |
| List members | ✅ | ✅ | ✅ | ✅ |
| Add / update / remove members | ✅ | ✅ | — | — |
| List & read databases | ✅ | ✅ | ✅ | ✅ |
| Create database | ✅ | ✅ | ✅ | — |
| Update database metadata | ✅ | ✅ | ✅ | — |
| Start / stop database | ✅ | ✅ | ✅ | — |
| Delete database | ✅ | ✅ | — | — |
| Connection info | ✅ | ✅ | ✅ | ✅ |
| List & read secrets | ✅ | ✅ | ✅ | ✅ |
| Create secret / version | ✅ | ✅ | ✅ | — |
| Update secret metadata | ✅ | ✅ | ✅ | — |
| Reveal secret | ✅ | ✅ | ✅ | ✅ |
| Disable secret version | ✅ | ✅ | — | — |
| Delete secret | ✅ | ✅ | — | — |
| List tags | ✅ | ✅ | ✅ | ✅ |
| Create / update / delete tags | ✅ | ✅ | partial | — |
| Attach tag to resource | ✅ | ✅ | ✅ | — |
| Detach tag from resource | ✅ | ✅ | — | — |

> `editor` can create, update and attach tags, but not delete or detach them.

### Member management rules

Additional rules apply on top of the matrix:

- Only an `owner` can assign or promote a member to `owner`.
- An `admin` cannot modify or remove `owner` members and cannot grant roles at or above their own level.
- The **last** `owner` of a project cannot be demoted or removed.

On access denial the API returns `403`.
