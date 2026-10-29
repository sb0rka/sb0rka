# drones

Background tasks for Sb0rka.

English | [Русский](README.md)

Tasks:
- Removes terminated databases and their associated password secrets: on each tick it calls the SQL function `api.cleanup_one_deleted_dbi()`, which cleans up databases one at a time when both the database and the secret are in the `deleted` state and the password is marked `absent`.

## Usage

Build: `go build -o bin/drones ./apps/drones`.

```bash
# one iteration and exit:
go run ./apps/drones gc --once

# on an interval:
go run ./apps/drones gc --interval 5s
```
