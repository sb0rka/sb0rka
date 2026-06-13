![sborka](docs/imgs/logo.png)

Sb0rka — a managed infrastructure for services, data, and AI agents.

Quickly provision PostgreSQL, securely manage secrets, and get built-in observability — all in one platform.

English | [Русский](README.md)

Fast PostgreSQL deployment, secure secrets management, and built-in telemetry in a unified environment.

---

[Site](https://sb0rka.ru) | [Documentation](https://docs.sb0rka.com/en) | [s0c CLI](apps/s0c)

System architecture — [ARCHITECTURE.md](ARCHITECTURE.md). Database schema — [db/SCHEMA.md](db/SCHEMA.md). Build, lint, local run — [CONTRIBUTING.md](CONTRIBUTING.md).

## Repository layout

- `apps/api`: HTTP API service
- `apps/console`: web-console of platform
- `apps/s0c`: CLI tool
- `db/migrations/platform`: platform database migrations (schema and ER diagram — see [`db/SCHEMA.md`](db/SCHEMA.md))
- `docs`: Project documentation
- `packages/contract`: request/response DTO shared between API and CLI
