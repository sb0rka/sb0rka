---
title: "Encrypted secrets storage"
description: "Secrets store sensitive values like API keys and passwords, encrypted at rest in your project. Only the reveal endpoint returns a plaintext secret value."
---

Secrets are encrypted key-value pairs scoped to a project. You use them to store sensitive configuration—API keys, tokens, environment variables, database passwords—alongside your other resources without exposing values in list responses or logs. Sb0rka encrypts every secret value before writing it to storage and only decrypts it when you explicitly call the **reveal** endpoint.

<Note>
  The secret value itself is **never** included in list or create responses. Only the `revealed_at` timestamp tells you when the value was last accessed. To read the actual value, call the reveal endpoint.
</Note>

## Secret fields

| Field         | Type              | Description                                                                           |
| ------------- | ----------------- | ------------------------------------------------------------------------------------- |
| `resource_id` | hex-string        | The resource ID that uniquely identifies this secret within the project.              |
| `name`        | string            | A descriptive name for the secret (for example, `OPENAI_API_KEY`).                    |
| `description` | string \| null    | Optional description of what the secret is used for.                                  |
| `revealed_at` | timestamp \| null | The last time the secret value was revealed. `null` if the value has never been read. |

## Revealing a secret

To retrieve the plaintext value, send a request to the reveal endpoint for the secret's `resource_id`:

```json
{
  "secret_value": "sk_live_abc123..."
}
```

Calling the reveal endpoint also updates `revealed_at` to the current timestamp, giving you an audit trail of when values were last read.

## System secrets

Sb0rka creates some secrets automatically on your behalf. When you provision a database, the platform generates a password and stores it as a secret named `DATABASE_<resource_id>_PASSWORD`. These system-managed secrets:

- Are created with a descriptive name and description linking them to their database.
- Are tagged with `database_resource_id = <resource_id>` (a system tag) to tie the secret to its database.
- Can be revealed and used exactly like any other secret.

<Warning>
  System secrets prefixed with DATABASE_ are bound to specific database resources and cannot be deleted or renamed.
</Warning>

## Secret limits

Your plan's `secret_limit` controls the total number of secrets you can store across all projects. Creating a secret when you have already reached the limit will return an error. Upgrade your plan or remove unused secrets to free up capacity.
