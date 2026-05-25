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
  query: string
}

interface QueryRunnerExecuteRequest {
  project_id: string
  database_id: string
  query: string
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
  const payload: QueryRunnerExecuteRequest = {
    project_id: data.project_id,
    database_id: data.database_id,
    query: data.query,
  }

  return apiRequest<RunDatabaseQueryResponse>({
    method: "POST",
    path: "/query",
    json: payload,
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

const SCHEMA_INTROSPECTION_SQL = `
SELECT
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    INNER JOIN information_schema.key_column_usage kcu
      ON tc.constraint_catalog = kcu.constraint_catalog
      AND tc.constraint_schema = kcu.constraint_schema
      AND tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = c.table_schema
      AND tc.table_name = c.table_name
      AND tc.constraint_type = 'PRIMARY KEY'
      AND kcu.column_name = c.column_name
  ) AS is_pk
FROM information_schema.columns c
WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY c.table_schema, c.table_name, c.ordinal_position
`

function parseSchemaRow(
  row: unknown[],
  index: number,
): {
  schema: string
  table: string
  column: QueryRunnerSchemaColumn
} {
  if (row.length < 6) {
    throw new Error(`Invalid schema row at index ${index}: expected 6 fields`)
  }

  const [schema, table, columnName, dataType, isNullableRaw, isPKRaw] = row
  if (
    typeof schema !== "string" ||
    typeof table !== "string" ||
    typeof columnName !== "string" ||
    typeof dataType !== "string"
  ) {
    throw new Error(`Invalid schema row at index ${index}: expected string fields`)
  }

  const isNullable =
    typeof isNullableRaw === "boolean"
      ? isNullableRaw
      : typeof isNullableRaw === "string"
        ? isNullableRaw.toUpperCase() === "YES"
        : false

  const isPK = typeof isPKRaw === "boolean" ? isPKRaw : String(isPKRaw).toLowerCase() === "true"

  return {
    schema,
    table,
    column: {
      name: columnName,
      data_type: dataType,
      is_nullable: isNullable,
      is_pk: isPK,
    },
  }
}

export async function fetchQueryRunnerSchema(data: {
  project_id: string
  database_id: string
}): Promise<QueryRunnerSchemaResponse> {
  const response = await runDatabaseQuery({
    ...data,
    query: SCHEMA_INTROSPECTION_SQL,
  })

  const tablesByName = new Map<string, QueryRunnerSchemaTable>()
  for (let i = 0; i < response.rows.length; i++) {
    const rawRow = response.rows[i]
    if (!Array.isArray(rawRow)) {
      throw new Error(`Invalid schema row at index ${i}: expected array`)
    }
    const parsed = parseSchemaRow(rawRow, i)
    const tableKey = `${parsed.schema}.${parsed.table}`
    const current = tablesByName.get(tableKey)
    if (!current) {
      tablesByName.set(tableKey, {
        schema: parsed.schema,
        name: parsed.table,
        columns: [parsed.column],
      })
      continue
    }
    current.columns.push(parsed.column)
  }

  return {
    tables: [...tablesByName.values()],
    duration_ms: response.duration_ms,
  }
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

export const OPENAI_DEFAULT_MODEL = "gpt-4o-mini"
export const OPENAI_FALLBACK_MODELS = Object.freeze([
  OPENAI_DEFAULT_MODEL,
  "openai/gpt-4o-mini",
  "openai/gpt-4.1-mini",
  "anthropic/claude-3.5-sonnet",
  "google/gemini-2.0-flash-001",
])

export type OpenAiModelPricing = {
  prompt: string
  completion: string
  input_cache_read?: string
}

export type OpenAiModelInfo = {
  id: string
  pricing?: OpenAiModelPricing
}

type OpenAiResponseJson = Record<string, unknown>

export interface OpenAiGenerateSqlRequest {
  openaiUrl: string
  openaiKey: string
  schema: string
  humanQuery: string
  model?: string
}

export interface OpenAiGenerateSqlResponse {
  sql: string
}

export interface OpenAiExplainSqlRequest {
  openaiUrl: string
  openaiKey: string
  schema: string
  dialect?: string
  sql: string
  style?: string
  model?: string
}

export interface OpenAiExplainSqlResponse {
  explanation: string
}

export interface OpenAiFixSqlRequest {
  openaiUrl: string
  openaiKey: string
  schema: string
  dialect?: string
  sql: string
  errorMessage: string
  model?: string
}

export interface OpenAiFixSqlResponse {
  explanation: string
  fixedSql: string
}

export interface OpenAiReviewSqlCorrectnessRequest {
  openaiUrl: string
  openaiKey: string
  schema: string
  humanQuery: string
  sql: string
  dialect?: string
  model?: string
}

export interface OpenAiReviewSqlCorrectnessResponse {
  status: "correct" | "rewrite"
  sql?: string
  reason?: string
}

export interface OpenAiReviewSqlOptimalityRequest {
  openaiUrl: string
  openaiKey: string
  schema: string
  humanQuery: string
  sql: string
  dialect?: string
  model?: string
}

export interface OpenAiReviewSqlOptimalityResponse {
  status: "optimal" | "alternative"
  sql?: string
  reason?: string
}

export interface OpenAiResolveOptimalSqlRequest {
  openaiUrl: string
  openaiKey: string
  schema: string
  humanQuery: string
  correctSql: string
  alternativeSql: string
  dialect?: string
  model?: string
}

export interface OpenAiResolveOptimalSqlResponse {
  sql: string
  reason?: string
}

function normalizeOpenAiCompletionsUrl(openaiUrl: string): string {
  const trimmed = openaiUrl.trim().replace(/\/+$/, "")
  if (!trimmed) {
    throw new Error("Secret `openaiurl` is empty")
  }
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed
  }
  return `${trimmed}/chat/completions`
}

function normalizeOpenAiBaseUrl(openaiUrl: string): string {
  const completionsUrl = normalizeOpenAiCompletionsUrl(openaiUrl)
  return completionsUrl.replace(/\/chat\/completions$/i, "")
}

function parseModelList(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function dedupeModelIds(models: string[]): string[] {
  return [...new Set(models.map((model) => model.trim()).filter(Boolean))]
}

function dedupeModelInfos(models: OpenAiModelInfo[]): OpenAiModelInfo[] {
  const seen = new Map<string, OpenAiModelInfo>()
  for (const model of models) {
    const id = model.id.trim()
    if (!id || seen.has(id)) continue
    seen.set(id, model)
  }
  return [...seen.values()]
}

function toModelInfoList(modelIds: readonly string[]): OpenAiModelInfo[] {
  return dedupeModelIds([...modelIds]).map((id) => ({ id }))
}

function parseModelsFromOpenAiUrl(openaiUrl: string): OpenAiModelInfo[] {
  try {
    const url = new URL(openaiUrl.trim())
    const explicitModels = [
      ...url.searchParams.getAll("model"),
      ...url.searchParams.getAll("models"),
      ...(url.hash.startsWith("#models=")
        ? [decodeURIComponent(url.hash.replace(/^#models=/, ""))]
        : []),
    ]
    return toModelInfoList(dedupeModelIds(explicitModels.flatMap(parseModelList)))
  } catch {
    return []
  }
}

function parseModelPricing(value: unknown): OpenAiModelPricing | undefined {
  if (!isObject(value)) return undefined
  const prompt = value.prompt
  const completion = value.completion
  if (typeof prompt !== "string" || typeof completion !== "string") return undefined
  const pricing: OpenAiModelPricing = { prompt, completion }
  if (typeof value.input_cache_read === "string") {
    pricing.input_cache_read = value.input_cache_read
  }
  return pricing
}

function extractModelsFromResponse(payload: unknown): OpenAiModelInfo[] {
  if (!isObject(payload) || !Array.isArray(payload.data)) return []
  const models: OpenAiModelInfo[] = []
  for (const item of payload.data) {
    if (!isObject(item) || typeof item.id !== "string" || !item.id.trim()) continue
    const info: OpenAiModelInfo = { id: item.id.trim() }
    const pricing = parseModelPricing(item.pricing)
    if (pricing) info.pricing = pricing
    models.push(info)
  }
  return dedupeModelInfos(models)
}

export async function listAvailableOpenAiModels(opts: {
  openaiUrl: string
  openaiKey: string
}): Promise<OpenAiModelInfo[]> {
  const fromUrl = parseModelsFromOpenAiUrl(opts.openaiUrl)
  if (fromUrl.length > 0) {
    return fromUrl
  }

  const openaiKey = opts.openaiKey.trim()
  if (!openaiKey) {
    return toModelInfoList(OPENAI_FALLBACK_MODELS)
  }

  const modelsUrl = `${normalizeOpenAiBaseUrl(opts.openaiUrl)}/models`
  try {
    const res = await fetch(modelsUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
      },
    })
    if (!res.ok) {
      return toModelInfoList(OPENAI_FALLBACK_MODELS)
    }
    const payload = (await res.json()) as unknown
    const models = extractModelsFromResponse(payload)
    return models.length > 0 ? models : toModelInfoList(OPENAI_FALLBACK_MODELS)
  } catch {
    return toModelInfoList(OPENAI_FALLBACK_MODELS)
  }
}

function extractAssistantMessage(payload: unknown): string {
  if (!isObject(payload) || !Array.isArray(payload.choices) || payload.choices.length === 0) {
    throw new Error("OpenAI response is missing choices")
  }

  const firstChoice = payload.choices[0]
  if (!isObject(firstChoice) || !isObject(firstChoice.message)) {
    throw new Error("OpenAI response is missing assistant message")
  }

  const content = firstChoice.message.content
  if (typeof content === "string") {
    return content
  }
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === "string") return part
        if (isObject(part) && typeof part.text === "string") return part.text
        return ""
      })
      .join("")
      .trim()
    if (joined.length > 0) return joined
  }

  throw new Error("OpenAI assistant message is empty")
}

function parseJsonObjectFromAssistantText(text: string): OpenAiResponseJson {
  const trimmed = text.trim()
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()
  const candidates = [withoutFence]
  const firstBrace = withoutFence.indexOf("{")
  const lastBrace = withoutFence.lastIndexOf("}")
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(withoutFence.slice(firstBrace, lastBrace + 1))
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      if (isObject(parsed)) return parsed
    } catch {
      // try the next candidate
    }
  }

  throw new Error("OpenAI response is not valid JSON")
}

function normalizeSqlCandidate(value: string): string {
  return value
    .trim()
    .replace(/^["'`]+/, "")
    .replace(/["'`]+$/, "")
    .trim()
}

function extractSqlFromAssistantText(text: string): string {
  const fencedMatches = [...text.matchAll(/```(?:sql)?\s*([\s\S]*?)```/gi)]
  for (const match of fencedMatches) {
    const block = normalizeSqlCandidate(match[1] ?? "")
    if (block) return block
  }

  const labeledMatch = text.match(/(?:^|\n)\s*(?:fixedSql|fixed_sql|sql)\s*[:=]\s*(.+)(?:\n|$)/i)
  if (labeledMatch?.[1]) {
    const candidate = normalizeSqlCandidate(labeledMatch[1])
    if (candidate) return candidate
  }

  const trimmed = text.trim()
  const looksLikeSql = /^(with|select|insert|update|delete|create|alter|drop)\b/i.test(trimmed)
  if (looksLikeSql) {
    return normalizeSqlCandidate(trimmed)
  }

  return ""
}

function extractExplanationFromAssistantText(text: string): string {
  return text
    .replace(/```(?:\w+)?\s*([\s\S]*?)```/gi, "$1")
    .replace(/(?:fixedSql|fixed_sql)\s*[:=]\s*.+/gi, "")
    .trim()
}

async function requestOpenAiAssistantText(opts: {
  openaiUrl: string
  openaiKey: string
  prompt: string
  model?: string
}): Promise<string> {
  const openaiKey = opts.openaiKey.trim()
  if (!openaiKey) {
    throw new Error("Secret `openaikey` is empty")
  }

  const url = normalizeOpenAiCompletionsUrl(opts.openaiUrl)
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: opts.model?.trim() || OPENAI_DEFAULT_MODEL,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: opts.prompt,
        },
      ],
    }),
  })

  if (!res.ok) {
    const bodyText = await res.text()
    throw new Error(bodyText || `OpenAI request failed with status ${res.status}`)
  }

  const payload = (await res.json()) as unknown
  return extractAssistantMessage(payload)
}

function buildGeneratePrompt(schema: string, humanQuery: string): string {
  return [
    `schema: ${schema}`,
    `query: ${humanQuery}`,
    "Dialect: postgresql",
    "Create one SQL statement that answers the query.",
    "Return ONLY a valid JSON object with no markdown or code fences.",
    'Response shape: {"sql": string}',
  ].join("\n")
}

function buildExplainPrompt(data: {
  schema: string
  dialect: string
  sql: string
  style: string
}): string {
  const styleInstruction = data.style.trim()
    ? `Style instruction: ${data.style}`
    : "Style instruction: Provide a clear SQL breakdown."
  return [
    `schema: ${data.schema}`,
    `dialect: ${data.dialect}`,
    `sql: ${data.sql}`,
    styleInstruction,
    "Explain this SQL query.",
    "Return ONLY a valid JSON object with no markdown or code fences.",
    'Response shape: {"explanation": string}',
  ].join("\n")
}

function buildFixPrompt(data: {
  schema: string
  dialect: string
  sql: string
  errorMessage: string
}): string {
  return [
    `schema: ${data.schema}`,
    `dialect: ${data.dialect}`,
    `sql: ${data.sql}`,
    `error: ${data.errorMessage}`,
    "Fix this SQL query according to the schema and the database error.",
    "Return ONLY a valid JSON object with no markdown or code fences.",
    'Response shape: {"explanation": string, "fixedSql": string}',
  ].join("\n")
}

function buildCorrectnessReviewPrompt(data: {
  schema: string
  dialect: string
  humanQuery: string
  sql: string
}): string {
  return [
    `schema: ${data.schema}`,
    `dialect: ${data.dialect}`,
    `human_prompt: ${data.humanQuery}`,
    `sql: ${data.sql}`,
    "Check whether this SQL fully and correctly answers the human prompt for the given schema.",
    "If SQL is correct, return status `correct`.",
    "If SQL is not correct, return status `rewrite` and provide a corrected SQL query in `sql`.",
    "Return ONLY a valid JSON object with no markdown or code fences.",
    'Response shape: {"status":"correct"|"rewrite","sql"?:string,"reason"?:string}',
  ].join("\n")
}

function buildOptimalityReviewPrompt(data: {
  schema: string
  dialect: string
  humanQuery: string
  sql: string
}): string {
  return [
    `schema: ${data.schema}`,
    `dialect: ${data.dialect}`,
    `human_prompt: ${data.humanQuery}`,
    `sql: ${data.sql}`,
    "Decide whether this SQL is already optimal for readability and performance while preserving semantics.",
    "If SQL is already optimal, return status `optimal`.",
    "If SQL can be improved, return status `alternative` and provide improved SQL in `sql`.",
    "Return ONLY a valid JSON object with no markdown or code fences.",
    'Response shape: {"status":"optimal"|"alternative","sql"?:string,"reason"?:string}',
  ].join("\n")
}

function buildResolveOptimalSqlPrompt(data: {
  schema: string
  dialect: string
  humanQuery: string
  correctSql: string
  alternativeSql: string
}): string {
  return [
    `schema: ${data.schema}`,
    `dialect: ${data.dialect}`,
    `human_prompt: ${data.humanQuery}`,
    `correct_sql: ${data.correctSql}`,
    `alternative_sql: ${data.alternativeSql}`,
    "Return one final SQL statement that preserves the human prompt semantics and is as optimal as possible.",
    "Return ONLY a valid JSON object with no markdown or code fences.",
    'Response shape: {"sql":string,"reason"?:string}',
  ].join("\n")
}

function parseReviewStatus<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fieldName: string,
): T {
  if (typeof value !== "string") {
    throw new Error(`OpenAI response missing \`${fieldName}\` string`)
  }
  const normalized = value.trim().toLowerCase()
  const matched = allowed.find((candidate) => candidate === normalized)
  if (!matched) {
    throw new Error(`OpenAI response has invalid \`${fieldName}\``)
  }
  return matched
}

function parseOptionalSql(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = normalizeSqlCandidate(value)
  return normalized || undefined
}

export async function generateSqlWithOpenAi(
  data: OpenAiGenerateSqlRequest,
): Promise<OpenAiGenerateSqlResponse> {
  const assistantText = await requestOpenAiAssistantText({
    openaiUrl: data.openaiUrl,
    openaiKey: data.openaiKey,
    model: data.model,
    prompt: buildGeneratePrompt(data.schema, data.humanQuery),
  })

  let sql = ""
  try {
    const json = parseJsonObjectFromAssistantText(assistantText)
    sql = typeof json.sql === "string" ? json.sql.trim() : ""
  } catch {
    sql = extractSqlFromAssistantText(assistantText)
  }

  if (!sql) {
    throw new Error("OpenAI response missing `sql` string")
  }
  return { sql }
}

export async function explainSqlWithOpenAi(
  data: OpenAiExplainSqlRequest,
): Promise<OpenAiExplainSqlResponse> {
  const assistantText = await requestOpenAiAssistantText({
    openaiUrl: data.openaiUrl,
    openaiKey: data.openaiKey,
    model: data.model,
    prompt: buildExplainPrompt({
      schema: data.schema,
      dialect: data.dialect ?? "postgresql",
      sql: data.sql,
      style: data.style ?? "",
    }),
  })

  let explanation = ""
  try {
    const json = parseJsonObjectFromAssistantText(assistantText)
    explanation = typeof json.explanation === "string" ? json.explanation : ""
  } catch {
    explanation = extractExplanationFromAssistantText(assistantText)
  }

  return { explanation }
}

export async function fixSqlWithOpenAi(data: OpenAiFixSqlRequest): Promise<OpenAiFixSqlResponse> {
  const assistantText = await requestOpenAiAssistantText({
    openaiUrl: data.openaiUrl,
    openaiKey: data.openaiKey,
    model: data.model,
    prompt: buildFixPrompt({
      schema: data.schema,
      dialect: data.dialect ?? "postgresql",
      sql: data.sql,
      errorMessage: data.errorMessage,
    }),
  })

  let explanation = ""
  let fixedSql = ""
  try {
    const json = parseJsonObjectFromAssistantText(assistantText)
    explanation = typeof json.explanation === "string" ? json.explanation : ""
    fixedSql = typeof json.fixedSql === "string" ? json.fixedSql.trim() : ""
  } catch {
    fixedSql = extractSqlFromAssistantText(assistantText)
    explanation = extractExplanationFromAssistantText(assistantText)
  }

  if (!fixedSql) {
    throw new Error("OpenAI response missing `fixedSql` string")
  }
  return { explanation, fixedSql }
}

export async function reviewSqlCorrectness(
  data: OpenAiReviewSqlCorrectnessRequest,
): Promise<OpenAiReviewSqlCorrectnessResponse> {
  const assistantText = await requestOpenAiAssistantText({
    openaiUrl: data.openaiUrl,
    openaiKey: data.openaiKey,
    model: data.model,
    prompt: buildCorrectnessReviewPrompt({
      schema: data.schema,
      dialect: data.dialect ?? "postgresql",
      humanQuery: data.humanQuery,
      sql: data.sql,
    }),
  })
  const json = parseJsonObjectFromAssistantText(assistantText)
  const status = parseReviewStatus(json.status, ["correct", "rewrite"], "status")
  const sql = parseOptionalSql(json.sql)
  const reason = typeof json.reason === "string" ? json.reason.trim() : undefined

  if (status === "rewrite" && !sql) {
    throw new Error("OpenAI response missing `sql` string for rewrite status")
  }
  return { status, sql, reason }
}

export async function reviewSqlOptimality(
  data: OpenAiReviewSqlOptimalityRequest,
): Promise<OpenAiReviewSqlOptimalityResponse> {
  const assistantText = await requestOpenAiAssistantText({
    openaiUrl: data.openaiUrl,
    openaiKey: data.openaiKey,
    model: data.model,
    prompt: buildOptimalityReviewPrompt({
      schema: data.schema,
      dialect: data.dialect ?? "postgresql",
      humanQuery: data.humanQuery,
      sql: data.sql,
    }),
  })
  const json = parseJsonObjectFromAssistantText(assistantText)
  const status = parseReviewStatus(json.status, ["optimal", "alternative"], "status")
  const sql = parseOptionalSql(json.sql)
  const reason = typeof json.reason === "string" ? json.reason.trim() : undefined

  if (status === "alternative" && !sql) {
    throw new Error("OpenAI response missing `sql` string for alternative status")
  }
  return { status, sql, reason }
}

export async function resolveOptimalSql(
  data: OpenAiResolveOptimalSqlRequest,
): Promise<OpenAiResolveOptimalSqlResponse> {
  const assistantText = await requestOpenAiAssistantText({
    openaiUrl: data.openaiUrl,
    openaiKey: data.openaiKey,
    model: data.model,
    prompt: buildResolveOptimalSqlPrompt({
      schema: data.schema,
      dialect: data.dialect ?? "postgresql",
      humanQuery: data.humanQuery,
      correctSql: data.correctSql,
      alternativeSql: data.alternativeSql,
    }),
  })
  const json = parseJsonObjectFromAssistantText(assistantText)
  const sql = parseOptionalSql(json.sql)
  if (!sql) {
    throw new Error("OpenAI response missing `sql` string")
  }
  const reason = typeof json.reason === "string" ? json.reason.trim() : undefined
  return { sql, reason }
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
