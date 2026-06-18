# api

Processing of platform API-requests.

English | [Русский](README.md)

## Documentation

- [Architecture](docs/architecture_en.md) — layers, request lifecycle, flows (database creation, secret encryption, GC).
- [Database schema](../../db/SCHEMA.md) — ER diagram and table descriptions.
- Endpoint contract — Swagger UI at `/swagger` (generated from code).

```bash
docker compose up -d
```

```bash
# Build locally:
go build -o api ./cmd/api

# Run the server:
./api server
```
