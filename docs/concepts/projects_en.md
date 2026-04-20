---
title: "Projects organization"
description: "Projects are the top-level namespace in Sb0rka. Every database and secret lives inside a project, isolated from resources in your other projects."
---

A project is the root container for all your work on Sb0rka. When you provision a database or store a secret, you do so inside a specific project. Projects are scoped to environment, so resources in one project are never visible or accessible from another project.

Every database and secret you create is associated with exactly one project via its `project_id`. Resources from one project cannot be referenced or accessed from another project. You can create multiple projects to separate environments (for example, production and staging), teams, or applications.

## Project fields

| Field         | Type           | Description                                           |
| ------------- | -------------- | ----------------------------------------------------- |
| `id`          | hex-string     | Unique identifier for the project.                    |
| `user_id`     | string (UUID)  | The ID of the user who owns the project.              |
| `name`        | string         | Human-readable name.                                  |
| `description` | string \| null | Optional description for the project.                 |
| `is_active`   | boolean        | Whether the project is active or queued for deletion. |
| `created_at`  | timestamp      | When the project was created.                         |
| `updated_at`  | timestamp      | When the project was last updated.                    |

## Project limits

Your plan controls how many projects you can create at a time. If you reach the `project_limit` on your plan, the API returns a `403 Forbidden` response when you attempt to create a new project. Upgrade your plan to increase this limit or initiate deletion process.
