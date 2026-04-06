# s0c

`s0c` is a CLI for running sb0rka project and database workflows from one place.
It is built for engineers and AI agents that want dependable, script-friendly API access without terminal friction.

English | [Русский] (README.md)

## Install and Launch

```bash
# Build locally:
go build -o s0c .

# Authenticate:
./s0c auth

# Jump into psql:
s0c psql
```

- Auth state is persisted under `~/.s0c/auth.json`.
- Defaults are stored in `~/.s0c/config.json`.

## API Commands

- `s0c api plan` - show your current user plan
- `s0c api projects` - list your projects
- `s0c api dbs` - list databases (uses `--project-id` or configured default)
- `s0c api dbs uri` - return database connection URI (uses configured defaults unless overridden)
- `s0c api dbs create --name <name> [--description <description>]` - create a database in a project
- `s0c psql` - open a real interactive local `psql` session using sb0rka connection details

Commands:

```bash
s0c api projects --pretty
s0c api dbs create --project-id <project-id> --name <database-name> --description "analytics cluster"
s0c psql --project-id <project-id> --database-id <database-id>
```

## AI-Friendly Behavior

- non-zero exit code on failure
- errors are printed to stderr with the `s0c:` prefix
- API JSON responses are emitted to stdout (single-line by default, pretty with `--pretty`)
- `s0c api dbs uri` emits only the connection URI text on stdout
