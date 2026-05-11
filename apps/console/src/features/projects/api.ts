import { apiRequest, apiRequestText } from "@/lib/api-client"

export interface ProjectResponse {
  id: string
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
  projectId: string,
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
  projectId: string,
): Promise<void> {
  return apiRequest<void>({
    method: "DELETE",
    path: `/projects/${projectId}`,
    base: "resource",
  })
}

export interface DatabaseResponse {
  resource_id: string
  name: string
  description?: string
  next_table_id: number
  sync_state?: "pending" | "ongoing" | "synced" | "failed"
  desired_state?: "present" | "absent"
}

export interface DatabaseListResponse {
  databases: DatabaseResponse[]
}

export interface CreateDatabaseRequest {
  name: string
  description?: string
}

export interface CreateSecretRequest {
  name: string
  description?: string
  secret_value: string
}

export interface UpdateDatabaseRequest {
  name?: string
  description?: string
}

export interface DatabaseWithSecretResponse {
  database: DatabaseResponse
  secret: SecretResponse
}

export async function createDatabase(
  projectId: string,
  data: CreateDatabaseRequest,
): Promise<DatabaseWithSecretResponse> {
  return apiRequest<DatabaseWithSecretResponse>({
    method: "POST",
    path: `/projects/${projectId}/database`,
    json: data,
    base: "resource",
  })
}

export async function listDatabases(
  projectId: string,
): Promise<DatabaseListResponse> {
  return apiRequest<DatabaseListResponse>({
    path: `/projects/${projectId}/databases`,
    base: "resource",
  })
}

export async function getDatabase(
  projectId: string,
  resourceId: string,
): Promise<DatabaseResponse> {
  return apiRequest<DatabaseResponse>({
    path: `/projects/${projectId}/resources/${resourceId}/database`,
    base: "resource",
  })
}

export async function updateDatabase(
  projectId: string,
  resourceId: string,
  data: UpdateDatabaseRequest,
): Promise<DatabaseResponse> {
  return apiRequest<DatabaseResponse>({
    method: "PATCH",
    path: `/projects/${projectId}/resources/${resourceId}/database`,
    json: data,
    base: "resource",
  })
}

export async function getDatabaseUri(
  projectId: string,
  resourceId: string,
): Promise<string> {
  return apiRequestText({
    path: `/projects/${projectId}/resources/${resourceId}/database/uri`,
    base: "resource",
  })
}

export interface RunDatabaseQueryRequest {
  project_id: string
  database_id: string
  sql: string
}

export interface RunDatabaseQueryResponse {
  columns: string[]
  rows: unknown[][]
  duration_ms: number
  row_count: number
  truncated: boolean
}

export async function runDatabaseQuery(
  data: RunDatabaseQueryRequest,
): Promise<RunDatabaseQueryResponse> {
  return apiRequest<RunDatabaseQueryResponse>({
    method: "POST",
    path: "/query",
    json: data,
    base: "queryRunner",
  })
}

export interface QueryRunnerSchemaColumn {
  name: string
  data_type: string
  is_nullable: boolean
  is_pk: boolean
}

export interface QueryRunnerSchemaTable {
  schema: string
  name: string
  columns: QueryRunnerSchemaColumn[]
}

export interface QueryRunnerSchemaResponse {
  tables: QueryRunnerSchemaTable[]
  duration_ms: number
}

export async function fetchQueryRunnerSchema(data: {
  project_id: string
  database_id: string
}): Promise<QueryRunnerSchemaResponse> {
  return apiRequest<QueryRunnerSchemaResponse>({
    method: "POST",
    path: "/schema",
    json: data,
    base: "queryRunner",
  })
}

export interface DeactivateResourceResponse {
  resource_id: string
  name: string
  description?: string
}

export interface ProjectResourceResponse {
  id: string
  project_id: string
  is_active: boolean
  resource_type: string
  created_at: string
  updated_at: string
}

export interface ProjectResourceListResponse {
  resources: ProjectResourceResponse[]
}

export async function listResources(
  projectId: string,
): Promise<ProjectResourceListResponse> {
  return apiRequest<ProjectResourceListResponse>({
    path: `/projects/${projectId}/resources`,
    base: "resource",
  })
}

export async function deactivateResource(
  projectId: string,
  resourceId: string,
): Promise<DeactivateResourceResponse> {
  return apiRequest<DeactivateResourceResponse>({
    method: "POST",
    path: `/projects/${projectId}/resources/${resourceId}/deactivate`,
    base: "resource",
  })
}

export async function getProject(
  projectId: string,
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
  projectId: string,
  resourceId: string,
): Promise<DBTableListResponse> {
  return apiRequest<DBTableListResponse>({
    path: `/projects/${projectId}/resources/${resourceId}/tables`,
    base: "resource",
  })
}

export interface DBTableColumnResponse {
  id: number
  table_id: number
  db_id: number
  name: string
  data_type: string
  is_pk: boolean
  is_nullable: boolean
  is_unique: boolean
  is_array: boolean
  default_value?: string
  fk?: string
  created_at: string
  updated_at: string
}

export interface DBTableColumnListResponse {
  columns: DBTableColumnResponse[]
}

export async function listTableColumns(
  projectId: string,
  resourceId: string,
  tableId: number,
): Promise<DBTableColumnListResponse> {
  return apiRequest<DBTableColumnListResponse>({
    path: `/projects/${projectId}/resources/${resourceId}/tables/${tableId}/columns`,
    base: "resource",
  })
}

export interface GenerateNl2SqlRequest {
  question: string
  schema: string
  dialect?: string
  explanationStyle?: string
}

export interface GenerateNl2SqlResponse {
  sql: string
  explanation?: string
  raw_message?: string
}

export async function generateNl2Sql(
  data: GenerateNl2SqlRequest,
): Promise<GenerateNl2SqlResponse> {
  return apiRequest<GenerateNl2SqlResponse>({
    method: "POST",
    path: "/generate",
    json: {
      question: data.question,
      schema: data.schema,
      dialect: data.dialect ?? "postgresql",
      explanationStyle: data.explanationStyle ?? "",
    },
    base: "nl2sql",
    auth: false,
  })
}

export interface ExplainNl2SqlRequest {
  sql: string
  style?: string
  schema?: string
  dialect?: string
}

export interface ExplainNl2SqlResponse {
  explanation: string
  raw_message?: string
}

export async function explainNl2Sql(
  data: ExplainNl2SqlRequest,
): Promise<ExplainNl2SqlResponse> {
  return apiRequest<ExplainNl2SqlResponse>({
    method: "POST",
    path: "/explain",
    json: {
      sql: data.sql,
      style: data.style ?? "",
      schema: data.schema ?? "",
      dialect: data.dialect ?? "postgresql",
    },
    base: "nl2sql",
    auth: false,
  })
}

export interface FixNl2SqlRequest {
  sql: string
  errorMessage: string
  schema?: string
  dialect?: string
}

export interface FixNl2SqlResponse {
  explanation: string
  fixed_sql: string
  raw_message?: string
}

export async function fixNl2Sql(data: FixNl2SqlRequest): Promise<FixNl2SqlResponse> {
  return apiRequest<FixNl2SqlResponse>({
    method: "POST",
    path: "/fix",
    json: {
      sql: data.sql,
      error_message: data.errorMessage,
      schema: data.schema ?? "",
      dialect: data.dialect ?? "postgresql",
    },
    base: "nl2sql",
    auth: false,
  })
}

export interface SecretResponse {
  resource_id: string
  name: string
  description?: string
  revealed_at?: string
}

export interface SecretListResponse {
  secrets: SecretResponse[]
}

export interface RevealSecretValueResponse {
  secret_value: string
}

export interface AttachResourceTagRequest {
  tag_key: string
  tag_value: string
  color?: string
}

export interface TagResponse {
  id: number
  project_id: number
  tag_key: string
  tag_value: string
  color?: string
  is_system: boolean
}

export interface ProjectTagListResponse {
  tags: TagResponse[]
}

export async function listResourceTags(
  projectId: string,
  resourceId: string,
): Promise<ProjectTagListResponse> {
  return apiRequest<ProjectTagListResponse>({
    path: `/projects/${projectId}/resources/${resourceId}/tags`,
    base: "resource",
  })
}

export async function attachResourceTag(
  projectId: string,
  resourceId: string,
  data: AttachResourceTagRequest,
): Promise<TagResponse> {
  return apiRequest<TagResponse>({
    method: "POST",
    path: `/projects/${projectId}/resources/${resourceId}/tag`,
    json: data,
    base: "resource",
  })
}

export async function listSecrets(
  projectId: string,
): Promise<SecretListResponse> {
  return apiRequest<SecretListResponse>({
    path: `/projects/${projectId}/secrets`,
    base: "resource",
  })
}

export async function createSecret(
  projectId: string,
  data: CreateSecretRequest,
): Promise<SecretResponse> {
  return apiRequest<SecretResponse>({
    method: "POST",
    path: `/projects/${projectId}/secret`,
    json: data,
    base: "resource",
  })
}

export async function revealSecretValue(
  projectId: string,
  resourceId: string,
): Promise<RevealSecretValueResponse> {
  return apiRequest<RevealSecretValueResponse>({
    path: `/projects/${projectId}/resources/${resourceId}/reveal`,
    base: "resource",
  })
}

export interface ObservabilityMetricPoint {
  timestamp: string
  value: number
}

export interface ResourceMetricTimeseries {
  unit: string
  points: ObservabilityMetricPoint[]
}

export interface ObservabilityMetricRange {
  from: string
  to: string
  step_seconds: number
}

export interface ObservabilityMetricRawPoint {
  ts: string
  value: number
}

export interface ObservabilityMetricTimeseriesResponse {
  metric: string
  unit: string
  range: ObservabilityMetricRange
  points: ObservabilityMetricRawPoint[]
  series_name: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function parseTimeseriesResponse(payload: unknown): ObservabilityMetricTimeseriesResponse {
  if (!isObject(payload)) {
    throw new Error("Invalid observability response payload")
  }

  const { metric, unit, range, points, series_name } = payload

  if (
    typeof metric !== "string" ||
    typeof unit !== "string" ||
    typeof series_name !== "string"
  ) {
    throw new Error("Invalid observability response metadata")
  }

  if (
    !isObject(range) ||
    typeof range.from !== "string" ||
    typeof range.to !== "string" ||
    typeof range.step_seconds !== "number"
  ) {
    throw new Error("Invalid observability range payload")
  }

  if (!Array.isArray(points)) {
    throw new Error("Invalid observability points payload")
  }

  const parsedPoints: ObservabilityMetricRawPoint[] = points.map((point) => {
    if (!isObject(point) || typeof point.ts !== "string" || typeof point.value !== "number") {
      throw new Error("Invalid observability point payload")
    }

    return {
      ts: point.ts,
      value: point.value,
    }
  })

  return {
    metric,
    unit,
    range: {
      from: range.from,
      to: range.to,
      step_seconds: range.step_seconds,
    },
    points: parsedPoints,
    series_name,
  }
}

export async function getResourceMetricTimeseries(
  projectId: string,
  resourceId: string,
  metric: string,
): Promise<ResourceMetricTimeseries> {
  const payload = await apiRequest<unknown>({
    path: `/projects/${projectId}/resources/${resourceId}/observability/metrics/timeseries?metric=${encodeURIComponent(metric)}`,
    base: "resource",
  })

  const parsed = parseTimeseriesResponse(payload)

  return {
    unit: parsed.unit,
    points: parsed.points
    .map((point) => ({
      timestamp: point.ts,
      value: point.value,
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
  }
}
