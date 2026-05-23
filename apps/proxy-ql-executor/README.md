# proxy-ql-executor

Proxy QL Executor requests to database.

## Safety Invariant

Do not store user, token, database URI, database ID, or database connection state in globals. Each invocation must resolve the database URI from the backend using the current bearer token, create its own PostgreSQL connection from that URI, and close it before returning.

## Development

```bash
go run -tags dev .
```
