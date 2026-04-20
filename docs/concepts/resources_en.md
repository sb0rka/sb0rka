---
title: "Resources and tags"
description: "Resources are the unified abstraction for all objects in a project. Databases and secrets are resources. Attach key-value tags to any resource for organization."
---

Every object you create inside a project—whether a database or a secret—is backed by a resource record. Resources give every object a consistent identity: a unique `id`, a lifecycle timestamps, and an `is_active` flag. Because all objects share this structure, you can manage them through a single resources API regardless of their type, and you can organize them with tags.

## Resource fields

| Field           | Type       | Description                                                                                                            |
| --------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| `id`            | hex-string | Unique identifier for the resource within the platform. This is the `resource_id` referenced by databases and secrets. |
| `project_id`    | hex-string | The project this resource belongs to.                                                                                  |
| `is_active`     | boolean    | Whether the resource is active. Deactivating a resource marks it inactive for permanently deleting it.                 |
| `resource_type` | string     | The type of resource, for example `database` or `secret`.                                                              |
| `created_at`    | timestamp  | When the resource was created.                                                                                         |
| `updated_at`    | timestamp  | When the resource was last updated.                                                                                    |

## Tags

Tags are key-value labels you attach to individual resources. You use them to organize, filter, and annotate your databases and secrets—for example, tagging a database with `env=production` or `team=backend`.

### Tag fields

| Field        | Type           | Description                                           |
| ------------ | -------------- | ----------------------------------------------------- |
| `id`         | integer        | Unique identifier for the tag.                        |
| `project_id` | hex-string     | The project this tag belongs to.                      |
| `tag_key`    | string         | The label key, for example `env`.                     |
| `tag_value`  | string         | The label value, for example `production`.            |
| `color`      | string \| null | Optional hex color for display purposes.              |
| `is_system`  | boolean        | Whether this tag was created automatically by Sb0rka. |

## System tags

Sb0rka automatically creates system tags when certain resources are provisioned. You cannot create system tags yourself.

The most common system tag is created when you provision a database:

| Tag key                | Tag value                | Attached to                                                |
| ---------------------- | ------------------------ | ---------------------------------------------------------- |
| `database_resource_id` | `<database resource_id>` | Both the database resource and its linked password secret. |

This tag is what allows the database URI endpoint to locate the correct credential secret for a given database. Both the database and its secret carry the same `database_resource_id` tag, making it straightforward to find all resources related to a specific database.

<Note>
  System tags have `is_system: true`. You can read and list them, but treat them as read-only.
</Note>
