import { apiRequest } from "@/lib/api-client"

export interface ProjectResponse {
  id: number
  user_id: string
  name: string
  description?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProjectListResponse {
  projects: ProjectResponse[]
}

export interface CreateProjectRequest {
  name: string
  description: string
}

export interface UpdateProjectRequest {
  name?: string
  description?: string
}

export async function listProjects(): Promise<ProjectListResponse> {
  return apiRequest<ProjectListResponse>({
    path: "/projects",
    base: "resource",
  })
}

export async function createProject(
  data: CreateProjectRequest,
): Promise<ProjectResponse> {
  return apiRequest<ProjectResponse>({
    method: "POST",
    path: "/projects",
    json: data,
    base: "resource",
  })
}

export async function updateProject(
  projectId: number,
  data: UpdateProjectRequest,
): Promise<ProjectResponse> {
  return apiRequest<ProjectResponse>({
    method: "PATCH",
    path: `/projects/${projectId}`,
    json: data,
    base: "resource",
  })
}

export async function deactivateProject(
  projectId: number,
): Promise<void> {
  return apiRequest<void>({
    method: "DELETE",
    path: `/projects/${projectId}/deactivate`,
    base: "resource",
  })
}

export interface DatabaseResponse {
  resource_id: number
  name: string
  description?: string
  next_table_id: number
}

export interface DatabaseListResponse {
  databases: DatabaseResponse[]
}

export async function listDatabases(
  projectId: number,
): Promise<DatabaseListResponse> {
  return apiRequest<DatabaseListResponse>({
    path: `/projects/${projectId}/databases`,
    base: "resource",
  })
}

export async function getProject(
  projectId: number,
): Promise<ProjectResponse> {
  return apiRequest<ProjectResponse>({
    path: `/projects/${projectId}`,
    base: "resource",
  })
}

export interface DBTableResponse {
  id: number
  db_id: number
  name: string
  description?: string
  next_column_id: number
  created_at: string
  updated_at: string
}

export interface DBTableListResponse {
  tables: DBTableResponse[]
}

export async function listTables(
  projectId: number,
  resourceId: number,
): Promise<DBTableListResponse> {
  return apiRequest<DBTableListResponse>({
    path: `/projects/${projectId}/resources/${resourceId}/tables`,
    base: "resource",
  })
}

export interface SecretResponse {
  resource_id: number
  name: string
  description?: string
  revealed_at?: string
}

export interface SecretListResponse {
  secrets: SecretResponse[]
}

export async function listSecrets(
  projectId: number,
): Promise<SecretListResponse> {
  return apiRequest<SecretListResponse>({
    path: `/projects/${projectId}/secrets`,
    base: "resource",
  })
}
