---
title: "Managed PostgreSQL"
description: "Sb0rka provisions dedicated PostgreSQL instances inside your projects. Each database gets unique hostname with auto-generated credentials and a ready-to-use connection URI."
---

When you create a database on Sb0rka, you get a dedicated PostgreSQL instance scoped to a project. Sb0rka handles provisioning: you supply a name, and the platform generates credentials for you, stores them as an encrypted secret, and gives you a connection URI you can hand directly to your application.

## Database fields

| Field           | Type           | Description                                                                |
| --------------- | -------------- | -------------------------------------------------------------------------- |
| `resource_id`   | hex-string     | The resource ID that uniquely identifies this database within the project. |
| `name`          | string         | Human-readable name for the database.                                      |
| `description`   | string \| null | Optional description.                                                      |
| `next_table_id` | integer        | The ID that will be assigned to the next table created in this database.   |

## Auto-generated credentials

When you create a database, Sb0rka automatically:

1. Generates a random alphanumeric password.
2. Encrypts it and stores it as a secret named `DATABASE_<resource_id>_PASSWORD`.
3. Tags both the database resource and the secret resource with `database_resource_id = <resource_id>` so they can be linked together.

This means every database has exactly one corresponding secret that holds its password.

## Connection URI

You can retrieve a ready-to-use connection string from the database URI endpoint. The URI follows this format:

```
postgresql://<username>:<password>@<unique_host>:5432/<database_name>?sslmode=require&sslnegotiation=direct
```

Sb0rka resolves the password from the linked secret automatically—you do not need to reveal the secret separately just to get the URI.

## Database limits

Your plan's `db_limit` controls how many databases you can create across all your projects. If you hit the limit, provision a new database will fail until you shutdown an existing one or upgrade your plan.
