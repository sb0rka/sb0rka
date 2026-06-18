---
title: "Platform API"
description: "The Platform API is Sb0rka's REST interface for managing projects, PostgreSQL databases, secrets and tags. The web console and the s0c CLI are built on the same endpoints."
---

The Platform API is Sb0rka's primary programmatic interface. Use it to create projects, provision databases, store secrets and manage team access. The web console and the `s0c` CLI are clients on top of this same API.

## Base URL

```
https://api.sb0rka.ru
```

All paths in the [reference](reference) are relative to this URL. Authentication is covered in [Authentication & access](authentication).

## Data format

- Requests and responses are JSON (`Content-Type: application/json`), except database URI reveal, which is returned as `text/plain`.
- Request bodies are validated strictly: **unknown fields cause** a `400 Bad Request`.
- Timestamps use RFC 3339 (`2026-06-06T12:00:00Z`).

## Identifiers

| Identifier | Form | Example |
| --- | --- | --- |
| `project_id` | hex string | `a1b2c3d4e5` |
| `resource_id` | hex string (database or secret) | `0f1e2d3c4b5a` |
| `subject_id` | user UUID | `7c9e6679-7425-40de-944b-e07fc1f90ae7` |
| `version_no` | secret version integer (≥ 1) | `3` |

A project is a container. Inside it live **resources** of two kinds: `database` and `secret`. Each resource has its own `resource_id`, unique within the project.

## Resource state

Sb0rka separates the **desired** state (which you set) from the **actual** runtime state (which the platform reconciles toward the desired one).

Database desired state (`desired_runtime_state`):

| Value | Meaning |
| --- | --- |
| `running` | the database should be running |
| `suspended` | the database should be paused |
| `terminated` | the database is marked for deletion |

Actual runtime state (`resource_state.runtime_state`):

`syncing` · `creating` · `available` · `starting` · `stopping` · `stopped` · `deleting` · `deleted` · `failed`

After a start/stop/delete request the resource enters an intermediate state and reaches the target asynchronously — poll `resource_state` to track the result.

## Errors

| Code | When |
| --- | --- |
| `400` | malformed body, invalid name/parameter |
| `401` | missing or invalid access token |
| `403` | the role lacks the permission, or a business rule was violated |
| `404` | resource not found |
| `409` | conflict (duplicate, last owner, inactive secret version) |
| `500` | internal error |

Most errors are returned as text with the matching HTTP status; some (e.g. access denial) as `{"error":"forbidden"}`.

## Getting started

1. Obtain an access token — see [Authentication & access](authentication).
2. Initialize the account: `POST /account/initialize` (attaches the free plan).
3. Create a project: `POST /projects`.
4. Provision a database: `POST /projects/{project_id}/dbi`.
5. Get the connection string: `POST /projects/{project_id}/resources/{resource_id}/dbi/uri/direct/reveal`.

The full list is in the [Endpoint reference](reference).
