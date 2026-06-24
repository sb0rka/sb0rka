import type { IncomingMessage, ServerResponse } from "node:http"
import { MockStore, createMockToken, type MockUser } from "./state"
import { MOCK_PLANS } from "./fixtures"

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(body))
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.statusCode = status
  res.setHeader("Content-Type", "text/plain; charset=utf-8")
  res.end(body)
}

function sendNoContent(res: ServerResponse): void {
  res.statusCode = 204
  res.end()
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString("utf8")
}

function parseBody(req: IncomingMessage, raw: string): Record<string, string> {
  const contentType = req.headers["content-type"] ?? ""
  if (contentType.includes("application/json")) {
    return JSON.parse(raw || "{}") as Record<string, string>
  }
  return Object.fromEntries(new URLSearchParams(raw))
}

function getBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) return null
  return header.slice("Bearer ".length)
}

function requireAuth(req: IncomingMessage, res: ServerResponse): boolean {
  if (!getBearerToken(req)) {
    sendText(res, 401, "Unauthorized")
    return false
  }
  return true
}

function matchPath(pathname: string): { name: string; params: Record<string, string> } | null {
  const routes: { name: string; pattern: RegExp }[] = [
    { name: "auth.login", pattern: /^\/auth\/login$/ },
    { name: "auth.signup", pattern: /^\/auth\/signup$/ },
    { name: "auth.refresh", pattern: /^\/auth\/refresh$/ },
    { name: "auth.logout", pattern: /^\/auth\/logout$/ },
    { name: "user.get", pattern: /^\/user$/ },
    { name: "user.patch", pattern: /^\/user$/ },
    { name: "user.password", pattern: /^\/user\/password$/ },
    { name: "plan.current", pattern: /^\/plan$/ },
    { name: "plans.list", pattern: /^\/plans$/ },
    { name: "projects.list", pattern: /^\/projects$/ },
    { name: "projects.create", pattern: /^\/projects$/ },
    { name: "projects.detail", pattern: /^\/projects\/(?<projectId>[^/]+)$/ },
    { name: "projects.databases", pattern: /^\/projects\/(?<projectId>[^/]+)\/databases$/ },
    { name: "projects.secrets", pattern: /^\/projects\/(?<projectId>[^/]+)\/secrets$/ },
    { name: "projects.resources", pattern: /^\/projects\/(?<projectId>[^/]+)\/resources$/ },
    { name: "projects.database.create", pattern: /^\/projects\/(?<projectId>[^/]+)\/database$/ },
    {
      name: "projects.resource.database",
      pattern: /^\/projects\/(?<projectId>[^/]+)\/resources\/(?<resourceId>[^/]+)\/database$/,
    },
    {
      name: "projects.resource.database.uri",
      pattern: /^\/projects\/(?<projectId>[^/]+)\/resources\/(?<resourceId>[^/]+)\/database\/uri$/,
    },
    {
      name: "projects.resource.metrics",
      pattern: /^\/projects\/(?<projectId>[^/]+)\/resources\/(?<resourceId>[^/]+)\/observability\/metrics\/timeseries$/,
    },
    {
      name: "projects.resource.deactivate",
      pattern: /^\/projects\/(?<projectId>[^/]+)\/resources\/(?<resourceId>[^/]+)$/,
    },
    {
      name: "projects.resource.tags",
      pattern: /^\/projects\/(?<projectId>[^/]+)\/resources\/(?<resourceId>[^/]+)\/tags$/,
    },
    {
      name: "projects.secret.create",
      pattern: /^\/projects\/(?<projectId>[^/]+)\/secret$/,
    },
    {
      name: "projects.resource.reveal",
      pattern: /^\/projects\/(?<projectId>[^/]+)\/resources\/(?<resourceId>[^/]+)\/reveal$/,
    },
  ]

  for (const route of routes) {
    const match = pathname.match(route.pattern)
    if (match) {
      return { name: route.name, params: (match.groups ?? {}) as Record<string, string> }
    }
  }

  return null
}

export async function handleMockRequest(
  req: IncomingMessage,
  res: ServerResponse,
  store: MockStore,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost")
  const route = matchPath(url.pathname)
  if (!route) return false

  const method = req.method ?? "GET"
  const rawBody = method === "GET" || method === "DELETE" ? "" : await readBody(req)
  const body = rawBody ? parseBody(req, rawBody) : {}

  switch (route.name) {
    case "auth.login": {
      if (method !== "POST") break
      sendJson(res, 200, { access_token: createMockToken(store.user.id) })
      return true
    }
    case "auth.signup": {
      if (method !== "POST") break
      const timestamp = new Date().toISOString()
      const user: MockUser = {
        id: store.user.id,
        username: body.username ?? "demo",
        email: body.email ?? "demo@sb0rka.local",
        created_at: timestamp,
        updated_at: timestamp,
      }
      store.user = user
      sendJson(res, 200, user)
      return true
    }
    case "auth.refresh": {
      if (method !== "POST") break
      sendJson(res, 200, { access_token: createMockToken(store.user.id) })
      return true
    }
    case "auth.logout": {
      if (method !== "POST") break
      sendNoContent(res)
      return true
    }
    case "user.get": {
      if (method !== "GET") break
      if (!requireAuth(req, res)) return true
      sendJson(res, 200, store.user)
      return true
    }
    case "user.patch": {
      if (method !== "PATCH") break
      if (!requireAuth(req, res)) return true
      if (body.username) store.user.username = body.username
      if (body.email) store.user.email = body.email
      if (body.phone) store.user.phone = Number(body.phone)
      store.user.updated_at = new Date().toISOString()
      sendJson(res, 200, store.user)
      return true
    }
    case "user.password": {
      if (method !== "PUT") break
      if (!requireAuth(req, res)) return true
      sendNoContent(res)
      return true
    }
    case "plan.current": {
      if (method !== "GET") break
      if (!requireAuth(req, res)) return true
      sendJson(res, 200, store.getPlan())
      return true
    }
    case "plans.list": {
      if (method !== "GET") break
      sendJson(res, 200, MOCK_PLANS)
      return true
    }
    case "projects.list": {
      if (method !== "GET") break
      if (!requireAuth(req, res)) return true
      sendJson(res, 200, { projects: store.projects })
      return true
    }
    case "projects.create": {
      if (method !== "POST") break
      if (!requireAuth(req, res)) return true
      const project = store.createProject({
        name: String(body.name ?? "New project"),
        description: String(body.description ?? ""),
      })
      sendJson(res, 200, project)
      return true
    }
    case "projects.detail": {
      const { projectId } = route.params
      if (method === "GET") {
        if (!requireAuth(req, res)) return true
        const project = store.projects.find((item) => item.id === projectId)
        if (!project) {
          sendText(res, 404, "project not found")
          return true
        }
        sendJson(res, 200, project)
        return true
      }
      if (method === "PATCH") {
        if (!requireAuth(req, res)) return true
        const project = store.updateProject(projectId, {
          name: body.name,
          description: body.description,
        })
        if (!project) {
          sendText(res, 404, "project not found")
          return true
        }
        sendJson(res, 200, project)
        return true
      }
      if (method === "DELETE") {
        if (!requireAuth(req, res)) return true
        if (!store.deactivateProject(projectId)) {
          sendText(res, 404, "project not found")
          return true
        }
        sendNoContent(res)
        return true
      }
      break
    }
    case "projects.databases": {
      if (method !== "GET") break
      if (!requireAuth(req, res)) return true
      sendJson(res, 200, { databases: store.databases.get(route.params.projectId) ?? [] })
      return true
    }
    case "projects.secrets": {
      if (method !== "GET") break
      if (!requireAuth(req, res)) return true
      sendJson(res, 200, { secrets: store.secrets.get(route.params.projectId) ?? [] })
      return true
    }
    case "projects.resources": {
      if (method !== "GET") break
      if (!requireAuth(req, res)) return true
      sendJson(res, 200, { resources: store.resources.get(route.params.projectId) ?? [] })
      return true
    }
    case "projects.database.create": {
      if (method !== "POST") break
      if (!requireAuth(req, res)) return true
      const projectId = route.params.projectId
      const resourceId = `db-${crypto.randomUUID().slice(0, 8)}`
      const database = {
        resource_id: resourceId,
        name: String(body.name ?? "database"),
        description: body.description,
        next_table_id: 1,
        sync_state: "synced" as const,
        desired_state: "present" as const,
      }
      const list = store.databases.get(projectId) ?? []
      list.push(database)
      store.databases.set(projectId, list)
      store.rebuildResources()
      sendJson(res, 200, {
        database,
        secret: {
          resource_id: `sec-${crypto.randomUUID().slice(0, 8)}`,
          name: `${database.name}_credentials`,
        },
      })
      return true
    }
    case "projects.resource.database": {
      const { projectId, resourceId } = route.params
      if (method === "GET") {
        if (!requireAuth(req, res)) return true
        const database = (store.databases.get(projectId) ?? []).find((item) => item.resource_id === resourceId)
        if (!database) {
          sendText(res, 404, "database not found")
          return true
        }
        sendJson(res, 200, database)
        return true
      }
      if (method === "PATCH") {
        if (!requireAuth(req, res)) return true
        const databases = store.databases.get(projectId) ?? []
        const database = databases.find((item) => item.resource_id === resourceId)
        if (!database) {
          sendText(res, 404, "database not found")
          return true
        }
        if (body.name) database.name = body.name
        if (body.description) database.description = body.description
        sendJson(res, 200, database)
        return true
      }
      break
    }
    case "projects.resource.database.uri": {
      if (method !== "GET") break
      if (!requireAuth(req, res)) return true
      sendText(res, 200, "postgresql://demo:demo@localhost:5432/demo")
      return true
    }
    case "projects.resource.metrics": {
      if (method !== "GET") break
      if (!requireAuth(req, res)) return true
      const metric = url.searchParams.get("metric") ?? "db_size"
      sendJson(res, 200, store.metricTimeseries(metric))
      return true
    }
    case "projects.resource.deactivate": {
      if (method !== "DELETE") break
      if (!requireAuth(req, res)) return true
      const { projectId, resourceId } = route.params
      const databases = store.databases.get(projectId) ?? []
      const dbIndex = databases.findIndex((item) => item.resource_id === resourceId)
      if (dbIndex !== -1) {
        databases.splice(dbIndex, 1)
        store.databases.set(projectId, databases)
        store.rebuildResources()
        sendNoContent(res)
        return true
      }
      const secrets = store.secrets.get(projectId) ?? []
      const secretIndex = secrets.findIndex((item) => item.resource_id === resourceId)
      if (secretIndex !== -1) {
        secrets.splice(secretIndex, 1)
        store.secrets.set(projectId, secrets)
        store.rebuildResources()
        sendNoContent(res)
        return true
      }
      sendText(res, 404, "resource not found")
      return true
    }
    case "projects.resource.tags": {
      if (method !== "GET") break
      if (!requireAuth(req, res)) return true
      sendJson(res, 200, { tags: [] })
      return true
    }
    case "projects.secret.create": {
      if (method !== "POST") break
      if (!requireAuth(req, res)) return true
      const projectId = route.params.projectId
      const secret = {
        resource_id: `sec-${crypto.randomUUID().slice(0, 8)}`,
        name: String(body.name ?? "secret"),
        description: body.description,
      }
      const list = store.secrets.get(projectId) ?? []
      list.push(secret)
      store.secrets.set(projectId, list)
      store.rebuildResources()
      sendJson(res, 200, secret)
      return true
    }
    case "projects.resource.reveal": {
      if (method !== "GET") break
      if (!requireAuth(req, res)) return true
      sendJson(res, 200, { secret_value: "mock-secret-value" })
      return true
    }
    default:
      break
  }

  sendText(res, 405, "method not allowed")
  return true
}
