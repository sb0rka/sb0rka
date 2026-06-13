# drones

Background tasks for the Sb0rka platform.

English | [Русский](README.md)

Removes terminated databases and their associated password secrets: on a tick it calls the SQL function `api.cleanup_one_deleted_dbi()`, which cleans, one at a time, databases where both the DB and its secret are in the `deleted` state and the password is marked `absent`. See the flow in [`apps/api/docs/architecture_en.md`](../api/docs/architecture_en.md).

## Run

```bash
# one iteration and exit:
go run ./apps/drones gc --once

# on an interval:
go run ./apps/drones gc --interval 5s
```

Build: `go build -o bin/drones ./apps/drones`.

## Commands

| Command | Purpose |
| --- | --- |
| `gc` | Run garbage collection (flags `--once`, `--interval`) |
| `version` | Print version |

## Configuration (env)

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URI` | `postgres://postgres:postgres@localhost:5432/platform` | platform DB connection string |
| `DATABASE_MAX_OPEN_CONNS` | `10` | connection pool size |
| `DATABASE_CONN_MAX_LIFETIME_SEC` | `30` | connection lifetime, sec |
| `GC_INTERVAL_SEC` | `5` | GC interval, sec (unless `--interval` flag is set) |
