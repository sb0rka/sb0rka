---
title: "s0c CLI"
description: "s0c is the official Sb0rka CLI. Manage projects and databases, open psql sessions, and integrate Sb0rka into scripts and AI agent workflows."
---

`s0c` is the official command-line interface for Sb0rka. It wraps the Sb0rka API in a set of focused commands so you can manage projects, databases, and connections without leaving your terminal. Every command is designed to be composable: JSON goes to stdout, errors go to stderr with an `s0c:` prefix, and any failure exits with a non-zero code — making `s0c` safe to embed in scripts, CI pipelines, and AI agent toolchains.

## What you can do with s0c

- **Authenticate** — paste your username/email and password once; `s0c` validates it and stores credentials locally under `~/.s0c/auth.json`.
- **Manage projects** — list all projects on your account.
- **Manage databases** — list databases, create new ones, and retrieve connection URIs.
- **Open psql sessions** — jump straight into an interactive `psql` session using your Sb0rka connection details.
- **Set defaults** — store a default project ID and database ID so you never have to pass them on every command.

## Designed for scripts and agents

`s0c` follows conventions that make it easy to integrate into automated workflows:

- API responses are single-line JSON by default; add `--pretty` for human-readable output.
- All errors are prefixed with `s0c:` and written to stderr, so they never pollute your stdout pipeline.
- Non-zero exit codes on failure mean any shell or agent can detect and handle errors reliably.
- `s0c api dbs uri` emits only the raw connection URI string — nothing else — so you can capture it directly with `$(...)`.

## Quickstart

<Steps>

1. Install - Use `go install github.com/sb0rka/sb0rka/apps/s0c@latest` (requires Go), or download a prebuilt binary from [GitHub Releases](https://github.com/sb0rka/sb0rka/releases).

2. Authenticate - Run `s0c auth login` and sign in with your Sb0rka credentials.

3. Create your first database - Run `s0c psql` to automatically create a project and database (if you do not have one yet) and it opens a `psql` session.

4. Set defaults - Run `s0c config -p <project_id> -d <database_id>` to save default project and database IDs for faster daily use.

</Steps>
