import { MOCK_PLAN, MOCK_USER_ID } from "./fixtures"

export interface MockUser {
  id: string
  username: string
  email: string
  phone?: number
  created_at: string
  updated_at: string
}

export interface MockProject {
  id: string
  user_id: string
  name: string
  description?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MockDatabase {
  resource_id: string
  name: string
  description?: string
  next_table_id: number
  sync_state?: "pending" | "ongoing" | "synced" | "failed"
  desired_state?: "present" | "absent"
}

export interface MockSecret {
  resource_id: string
  name: string
  description?: string
  revealed_at?: string
}

export interface MockResource {
  id: string
  project_id: string
  is_active: boolean
  resource_type: string
  created_at: string
  updated_at: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

export function createMockToken(userId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  })).toString("base64url")
  return `${header}.${payload}.mock`
}

export class MockStore {
  user: MockUser = {
    id: MOCK_USER_ID,
    username: "demo",
    email: "demo@sb0rka.local",
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
  }

  projects: MockProject[] = [
    {
      id: "proj-alpha",
      user_id: MOCK_USER_ID,
      name: "Alpha Commerce",
      description: "Sample project for mobile layout testing",
      is_active: true,
      created_at: "2025-02-10T10:00:00.000Z",
      updated_at: "2025-02-10T10:00:00.000Z",
    },
    {
      id: "proj-beta",
      user_id: MOCK_USER_ID,
      name: "Beta Analytics",
      description: "Second project with fewer resources",
      is_active: true,
      created_at: "2025-03-01T12:00:00.000Z",
      updated_at: "2025-03-01T12:00:00.000Z",
    },
  ]

  databases = new Map<string, MockDatabase[]>([
    ["proj-alpha", [
      {
        resource_id: "db-orders",
        name: "orders",
        description: "Transactional orders database",
        next_table_id: 4,
        sync_state: "synced",
        desired_state: "present",
      },
      {
        resource_id: "db-users",
        name: "users",
        description: "User profiles",
        next_table_id: 2,
        sync_state: "synced",
        desired_state: "present",
      },
    ]],
    ["proj-beta", [
      {
        resource_id: "db-events",
        name: "events",
        next_table_id: 1,
        sync_state: "synced",
        desired_state: "present",
      },
    ]],
  ])

  secrets = new Map<string, MockSecret[]>([
    ["proj-alpha", [
      {
        resource_id: "sec-api-key",
        name: "stripe_api_key",
        description: "Payments integration",
      },
    ]],
    ["proj-beta", []],
  ])

  resources = new Map<string, MockResource[]>()

  constructor() {
    this.rebuildResources()
  }

  rebuildResources(): void {
    for (const project of this.projects) {
      const databases = this.databases.get(project.id) ?? []
      const secrets = this.secrets.get(project.id) ?? []
      const createdAt = project.created_at
      const updatedAt = project.updated_at

      this.resources.set(project.id, [
        ...databases.map((db) => ({
          id: db.resource_id,
          project_id: project.id,
          is_active: true,
          resource_type: "database",
          created_at: createdAt,
          updated_at: updatedAt,
        })),
        ...secrets.map((secret) => ({
          id: secret.resource_id,
          project_id: project.id,
          is_active: true,
          resource_type: "secret",
          created_at: createdAt,
          updated_at: updatedAt,
        })),
      ])
    }
  }

  getPlan() {
    return MOCK_PLAN
  }

  createProject(input: { name: string; description: string }): MockProject {
    const timestamp = nowIso()
    const project: MockProject = {
      id: id("proj"),
      user_id: MOCK_USER_ID,
      name: input.name,
      description: input.description,
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp,
    }
    this.projects.push(project)
    this.databases.set(project.id, [])
    this.secrets.set(project.id, [])
    this.rebuildResources()
    return project
  }

  updateProject(projectId: string, input: { name?: string; description?: string }): MockProject | null {
    const project = this.projects.find((item) => item.id === projectId)
    if (!project) return null
    if (input.name !== undefined) project.name = input.name
    if (input.description !== undefined) project.description = input.description
    project.updated_at = nowIso()
    return project
  }

  deactivateProject(projectId: string): boolean {
    const index = this.projects.findIndex((item) => item.id === projectId)
    if (index === -1) return false
    this.projects.splice(index, 1)
    this.databases.delete(projectId)
    this.secrets.delete(projectId)
    this.resources.delete(projectId)
    return true
  }

  metricTimeseries(metric: string) {
    const points = Array.from({ length: 12 }, (_, index) => {
      const timestamp = new Date(Date.now() - (11 - index) * 5 * 60_000).toISOString()
      const base = metric.includes("net") ? 1200 : metric.includes("connections") ? 8 : 1_000_000
      return { timestamp, value: base + index * (metric.includes("connections") ? 1 : 100) }
    })
    return {
      unit: metric.includes("connections") ? "connections" : "bytes_per_second",
      points,
    }
  }
}
