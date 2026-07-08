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

export type OpenAiModelPricing = {
  prompt: string
  completion: string
  input_cache_read?: string
}

export type OpenAiModelInfo = {
  id: string
  pricing?: OpenAiModelPricing
}

export type OpenAiRequestUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens?: number
  reasoningTokens?: number
  costUsd?: number
}

export type OpenAiAssistantTextResult = {
  text: string
  usage?: OpenAiRequestUsage
}

type OpenAiResponseJson = Record<string, unknown>

export interface OpenAiGenerateSqlRequest {
  openaiUrl: string
  openaiKey: string
  schema: string
  humanQuery: string
  model?: string
  signal?: AbortSignal
}

export interface OpenAiGenerateSqlResponse {
  title: string
  sql: string
  usage?: OpenAiRequestUsage
}

export interface OpenAiExplainSqlRequest {
  openaiUrl: string
  openaiKey: string
  schema: string
  dialect?: string
  sql: string
  style?: string
  model?: string
  signal?: AbortSignal
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
  signal?: AbortSignal
}

export interface OpenAiFixSqlResponse {
  explanation: string
  fixedSql: string
  explanationUsage?: OpenAiRequestUsage
  fixedSqlUsage?: OpenAiRequestUsage
}

export interface OpenAiReviewSqlCorrectnessRequest {
  openaiUrl: string
  openaiKey: string
  schema: string
  humanQuery: string
  sql: string
  dialect?: string
  model?: string
  signal?: AbortSignal
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
  signal?: AbortSignal
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
  signal?: AbortSignal
}

export interface OpenAiResolveOptimalSqlResponse {
  sql: string
  reason?: string
}

function normalizeOpenAiCompletionsUrl(openaiUrl: string): string {
  const trimmed = openaiUrl.trim().replace(/\/+$/, "")
  if (!trimmed) {
    throw new Error("Secret `LLM_BASE_URL` is empty")
  }
  if (/\/chat\/completions$/i.test(trimmed)) {
    return trimmed
  }
  return `${trimmed}/chat/completions`
}

function normalizeOpenAiResponsesUrl(openaiUrl: string): string {
  const base = normalizeOpenAiBaseUrl(openaiUrl).replace(/\/+$/, "")
  return `${base}/responses`
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
    return []
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
      return []
    }
    const payload = (await res.json()) as unknown
    return extractModelsFromResponse(payload)
  } catch {
    return []
  }
}

function parseCachedInputTokens(value: unknown): number | undefined {
  if (!isObject(value)) return undefined
  for (const key of ["input_tokens_details", "prompt_tokens_details"] as const) {
    const details = value[key]
    if (
      isObject(details) &&
      typeof details.cached_tokens === "number" &&
      Number.isFinite(details.cached_tokens) &&
      details.cached_tokens > 0
    ) {
      return details.cached_tokens
    }
  }
  return undefined
}

function parseReasoningTokens(value: unknown): number | undefined {
  if (!isObject(value)) return undefined
  for (const key of ["output_tokens_details", "completion_tokens_details"] as const) {
    const details = value[key]
    if (
      isObject(details) &&
      typeof details.reasoning_tokens === "number" &&
      Number.isFinite(details.reasoning_tokens)
    ) {
      return details.reasoning_tokens
    }
  }
  return undefined
}

export function parseOpenAiRequestUsage(value: unknown): OpenAiRequestUsage | undefined {
  if (!isObject(value)) return undefined

  const usesResponsesApiFields =
    typeof value.input_tokens === "number" || typeof value.output_tokens === "number"

  const inputTokens = usesResponsesApiFields
    ? typeof value.input_tokens === "number"
      ? value.input_tokens
      : undefined
    : typeof value.prompt_tokens === "number"
      ? value.prompt_tokens
      : undefined
  const outputTokens = usesResponsesApiFields
    ? typeof value.output_tokens === "number"
      ? value.output_tokens
      : undefined
    : typeof value.completion_tokens === "number"
      ? value.completion_tokens
      : undefined

  if (inputTokens === undefined && outputTokens === undefined) return undefined

  const totalTokens =
    typeof value.total_tokens === "number"
      ? value.total_tokens
      : (inputTokens ?? 0) + (outputTokens ?? 0)

  const usage: OpenAiRequestUsage = {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens,
  }

  const reasoningTokens = parseReasoningTokens(value)
  if (reasoningTokens !== undefined) {
    usage.reasoningTokens = reasoningTokens
  }

  const cachedInputTokens = parseCachedInputTokens(value)
  if (cachedInputTokens !== undefined) {
    usage.cachedInputTokens = cachedInputTokens
  }

  if (typeof value.cost === "number" && Number.isFinite(value.cost)) {
    usage.costUsd = value.cost
  } else if (isObject(value.cost_details)) {
    const upstream = value.cost_details.upstream_inference_cost
    if (typeof upstream === "number" && Number.isFinite(upstream)) {
      usage.costUsd = upstream
    }
  }

  return usage
}

function parseUsageFromUnknown(value: unknown): OpenAiRequestUsage | undefined {
  return parseOpenAiRequestUsage(value)
}

function extractUsageFromPayload(payload: unknown): OpenAiRequestUsage | undefined {
  if (!isObject(payload)) return undefined

  const direct = parseUsageFromUnknown(payload.usage)
  if (direct) return direct

  if (isObject(payload.response)) {
    const fromResponse = parseUsageFromUnknown(payload.response.usage)
    if (fromResponse) return fromResponse
  }

  return undefined
}

export function estimateUsageCostUsd(
  usage: OpenAiRequestUsage,
  pricing: OpenAiModelPricing | undefined,
): number | null {
  if (usage.costUsd !== undefined) return usage.costUsd
  if (!pricing) return null

  const promptRate = Number(pricing.prompt)
  const completionRate = Number(pricing.completion)
  if (
    !Number.isFinite(promptRate) ||
    !Number.isFinite(completionRate) ||
    promptRate < 0 ||
    completionRate < 0
  ) {
    return null
  }

  return usage.inputTokens * promptRate + usage.outputTokens * completionRate
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

const GENERIC_GENERATED_SQL_TITLES = new Set([
  "query",
  "sql",
  "sql query",
  "generated query",
  "generated sql",
])

function fallbackGeneratedSqlTitle(humanQuery: string): string {
  const normalized = humanQuery
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?.!,;:]+$/g, "")
  if (!normalized) return "Generated SQL"
  return normalized.length > 80 ? `${normalized.slice(0, 77).trim()}...` : normalized
}

function normalizeGeneratedSqlTitle(value: unknown, fallbackTitle: string): string {
  if (typeof value !== "string") return fallbackTitle
  const title = value.trim().replace(/\s+/g, " ")
  if (!title || GENERIC_GENERATED_SQL_TITLES.has(title.toLowerCase())) {
    return fallbackTitle
  }
  return title.length > 0 ? title.slice(0, 160) : fallbackTitle
}

function extractGeneratedSqlFromAssistantText(
  text: string,
  fallbackTitle: string,
): { title: string; sql: string } {
  try {
    const parsed = parseJsonObjectFromAssistantText(text)
    const sql = parseOptionalSql(parsed.sql)
    if (!sql) {
      throw new Error("OpenAI response missing `sql` string")
    }
    return {
      title: normalizeGeneratedSqlTitle(parsed.title, fallbackTitle),
      sql,
    }
  } catch {
    const sql = extractSqlFromAssistantText(text)
    if (!sql) {
      throw new Error("OpenAI response missing `sql` string")
    }
    return { title: fallbackTitle, sql }
  }
}

function extractGeneratedSqlPreview(text: string): string {
  try {
    return extractGeneratedSqlFromAssistantText(text, "Generated SQL").sql
  } catch {
    const match = text.match(/"sql"\s*:\s*"((?:\\.|[^"\\])*)/s)
    if (!match?.[1]) return ""
    try {
      return JSON.parse(`"${match[1]}"`) as string
    } catch {
      return match[1].replace(/\\n/g, "\n").replace(/\\"/g, "\"")
    }
  }
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
  signal?: AbortSignal
}): Promise<OpenAiAssistantTextResult> {
  const openaiKey = opts.openaiKey.trim()
  if (!openaiKey) {
    throw new Error("Secret `LLM_API_KEY` is empty")
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
    signal: opts.signal,
  })

  if (!res.ok) {
    const bodyText = await res.text()
    throw new Error(bodyText || `OpenAI request failed with status ${res.status}`)
  }

  const payload = (await res.json()) as unknown
  return {
    text: extractAssistantMessage(payload),
    usage: extractUsageFromPayload(payload),
  }
}

function parseSseBlock(block: string): { event: string | null; data: string } | null {
  const lines = block.split(/\r?\n/)
  let event: string | null = null
  const dataLines: string[] = []
  for (const line of lines) {
    if (!line || line.startsWith(":")) continue
    if (line.startsWith("event:")) {
      event = line.slice(6).trim() || null
      continue
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  if (dataLines.length === 0) return null
  return { event, data: dataLines.join("\n") }
}

function extractOutputTextFromCompletedResponse(eventPayload: unknown): string {
  if (!isObject(eventPayload) || !isObject(eventPayload.response)) return ""
  const output = eventPayload.response.output
  if (!Array.isArray(output)) return ""
  const chunks: string[] = []
  for (const item of output) {
    if (!isObject(item)) continue
    const content = item.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!isObject(part)) continue
      const isOutputText = part.type === "output_text"
      if (!isOutputText || typeof part.text !== "string") continue
      chunks.push(part.text)
    }
  }
  return chunks.join("")
}

type OpenAiAssistantStreamRequest = {
  openaiUrl: string
  openaiKey: string
  prompt: string
  model?: string
  signal?: AbortSignal
  onText?: (text: string) => void
  onReasoningText?: (text: string) => void
}

function parseEmbeddedSseJsonLine(line: string): { type: string; delta?: string } | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith("data:")) return null
  const rawJson = trimmed.slice(5).trim()
  if (!rawJson || rawJson === "[DONE]") return null
  try {
    const parsed = JSON.parse(rawJson) as unknown
    if (!isObject(parsed) || typeof parsed.type !== "string") return null
    return {
      type: parsed.type,
      delta: typeof parsed.delta === "string" ? parsed.delta : undefined,
    }
  } catch {
    return null
  }
}

function streamUsageEventRank(type: string | null | undefined): number {
  if (type === "response.done" || type === "response.completed") return 2
  if (type === "response.incomplete") return 1
  return 0
}

async function requestOpenAiAssistantTextStream(
  opts: OpenAiAssistantStreamRequest,
): Promise<OpenAiAssistantTextResult> {
  const openaiKey = opts.openaiKey.trim()
  if (!openaiKey) {
    throw new Error("Secret `LLM_API_KEY` is empty")
  }
  const url = normalizeOpenAiResponsesUrl(opts.openaiUrl)
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: opts.model?.trim() || OPENAI_DEFAULT_MODEL,
      input: opts.prompt,
      temperature: 0,
      stream: true,
    }),
    signal: opts.signal,
  })

  if (!res.ok) {
    const bodyText = await res.text()
    throw new Error(bodyText || `OpenAI request failed with status ${res.status}`)
  }
  if (!res.body) {
    throw new Error("OpenAI stream is missing response body")
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let accumulated = ""
  let reasoningAccumulated = ""
  let latestUsage: OpenAiRequestUsage | undefined
  let latestUsageRank = -1
  const separatorRegex = /\r?\n\r?\n/

  const flushBlock = (block: string) => {
    const parsed = parseSseBlock(block)
    if (!parsed || parsed.data === "[DONE]") return
    let payload: unknown
    try {
      payload = JSON.parse(parsed.data) as unknown
    } catch {
      return
    }
    if (!isObject(payload)) return

    const type = typeof payload.type === "string" ? payload.type : parsed.event
    const usageFromPayload = extractUsageFromPayload(payload)
    if (usageFromPayload) {
      const rank = streamUsageEventRank(type)
      if (rank >= latestUsageRank) {
        latestUsage = usageFromPayload
        latestUsageRank = rank
      }
    }

    if (type === "error") {
      const message =
        isObject(payload.error) && typeof payload.error.message === "string"
          ? payload.error.message
          : "OpenAI stream returned an error"
      throw new Error(message)
    }
    if (type === "response.output_text.delta" && typeof payload.delta === "string") {
      const rawDelta = payload.delta
      const lines = rawDelta.split(/\r?\n/)
      const visibleDeltaParts: string[] = []
      for (const line of lines) {
        const embedded = parseEmbeddedSseJsonLine(line)
        if (embedded?.type === "response.reasoning_text.delta" && embedded.delta) {
          reasoningAccumulated += embedded.delta
          opts.onReasoningText?.(reasoningAccumulated)
          continue
        }
        visibleDeltaParts.push(line)
      }
      const visibleDelta = visibleDeltaParts.join("\n")
      if (!visibleDelta) return
      accumulated += visibleDelta
      opts.onText?.(accumulated)
      return
    }
    if (type === "response.reasoning_text.delta" && typeof payload.delta === "string") {
      reasoningAccumulated += payload.delta
      opts.onReasoningText?.(reasoningAccumulated)
      return
    }
    if (type === "response.refusal.delta" && typeof payload.delta === "string") {
      accumulated += payload.delta
      opts.onText?.(accumulated)
      return
    }
    if (
      (type === "response.completed" || type === "response.done") &&
      accumulated.trim().length === 0
    ) {
      const completedText = extractOutputTextFromCompletedResponse(payload).trim()
      if (completedText.length > 0) {
        accumulated = completedText
        opts.onText?.(accumulated)
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let separatorMatch = separatorRegex.exec(buffer)
    while (separatorMatch) {
      const separatorStart = separatorMatch.index
      const separatorLength = separatorMatch[0].length
      const block = buffer.slice(0, separatorStart)
      buffer = buffer.slice(separatorStart + separatorLength)
      flushBlock(block)
      separatorMatch = separatorRegex.exec(buffer)
    }
  }

  buffer += decoder.decode()
  const tail = buffer.trim()
  if (tail.length > 0) {
    flushBlock(tail)
  }
  return { text: accumulated, usage: latestUsage }
}

function buildGeneratePrompt(schema: string, humanQuery: string): string {
  return [
    `schema: ${schema}`,
    `query: ${humanQuery}`,
    "Dialect: postgresql",
    "Create one SQL statement that answers the query.",
    "Also create a short human-readable title that summarizes the user's request.",
    "Title requirements: 3-8 words, specific to requested data, not a generic label.",
    "Do not use titles like `SQL query`, `Generated SQL`, `Query`, or `Result`.",
    "Return ONLY a valid JSON object with no markdown or code fences.",
    'Response shape: {"title":string,"sql":string}',
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
    "Return ONLY plain explanation text.",
    "Do not return JSON.",
  ].join("\n")
}

function buildFixExplanationPrompt(data: {
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
    "Explain what is wrong with this SQL query and how to fix it.",
    "Return ONLY plain explanation text.",
    "Do not return JSON.",
  ].join("\n")
}

function buildFixSqlPrompt(data: {
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
    "Return ONLY the fixed SQL text.",
    "Do not return JSON.",
    "Do not add explanations before or after SQL.",
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
  const { text: assistantText, usage } = await requestOpenAiAssistantText({
    openaiUrl: data.openaiUrl,
    openaiKey: data.openaiKey,
    model: data.model,
    prompt: buildGeneratePrompt(data.schema, data.humanQuery),
    signal: data.signal,
  })

  const { title, sql } = extractGeneratedSqlFromAssistantText(
    assistantText,
    fallbackGeneratedSqlTitle(data.humanQuery),
  )
  return { title, sql, usage }
}

export async function generateSqlWithOpenAiStream(
  data: OpenAiGenerateSqlRequest & {
    onText?: (text: string) => void
    onReasoningText?: (text: string) => void
  },
): Promise<OpenAiGenerateSqlResponse> {
  const { text: assistantText, usage } = await requestOpenAiAssistantTextStream({
    openaiUrl: data.openaiUrl,
    openaiKey: data.openaiKey,
    model: data.model,
    prompt: buildGeneratePrompt(data.schema, data.humanQuery),
    signal: data.signal,
    onText: (text) => {
      const preview = extractGeneratedSqlPreview(text)
      if (preview) data.onText?.(preview)
    },
    onReasoningText: data.onReasoningText,
  })

  const { title, sql } = extractGeneratedSqlFromAssistantText(
    assistantText,
    fallbackGeneratedSqlTitle(data.humanQuery),
  )
  return { title, sql, usage }
}

export async function explainSqlWithOpenAi(
  data: OpenAiExplainSqlRequest,
): Promise<OpenAiExplainSqlResponse> {
  const { text: assistantText } = await requestOpenAiAssistantText({
    openaiUrl: data.openaiUrl,
    openaiKey: data.openaiKey,
    model: data.model,
    prompt: buildExplainPrompt({
      schema: data.schema,
      dialect: data.dialect ?? "postgresql",
      sql: data.sql,
      style: data.style ?? "",
    }),
    signal: data.signal,
  })

  return { explanation: extractExplanationFromAssistantText(assistantText) }
}

export async function explainSqlWithOpenAiStream(
  data: OpenAiExplainSqlRequest & {
    onText?: (text: string) => void
    onReasoningText?: (text: string) => void
  },
): Promise<OpenAiExplainSqlResponse> {
  const { text: assistantText } = await requestOpenAiAssistantTextStream({
    openaiUrl: data.openaiUrl,
    openaiKey: data.openaiKey,
    model: data.model,
    prompt: buildExplainPrompt({
      schema: data.schema,
      dialect: data.dialect ?? "postgresql",
      sql: data.sql,
      style: data.style ?? "",
    }),
    signal: data.signal,
    onText: data.onText,
    onReasoningText: data.onReasoningText,
  })

  return { explanation: extractExplanationFromAssistantText(assistantText) }
}

export async function fixSqlWithOpenAi(data: OpenAiFixSqlRequest): Promise<OpenAiFixSqlResponse> {
  const { text: explanationText, usage: explanationUsage } = await requestOpenAiAssistantText({
    openaiUrl: data.openaiUrl,
    openaiKey: data.openaiKey,
    model: data.model,
    prompt: buildFixExplanationPrompt({
      schema: data.schema,
      dialect: data.dialect ?? "postgresql",
      sql: data.sql,
      errorMessage: data.errorMessage,
    }),
    signal: data.signal,
  })

  const { text: fixedSqlText, usage: fixedSqlUsage } = await requestOpenAiAssistantText({
    openaiUrl: data.openaiUrl,
    openaiKey: data.openaiKey,
    model: data.model,
    prompt: buildFixSqlPrompt({
      schema: data.schema,
      dialect: data.dialect ?? "postgresql",
      sql: data.sql,
      errorMessage: data.errorMessage,
    }),
    signal: data.signal,
  })

  const explanation = extractExplanationFromAssistantText(explanationText)
  const fixedSql = extractSqlFromAssistantText(fixedSqlText)
  if (!fixedSql) {
    throw new Error("OpenAI response missing `fixedSql` string")
  }
  return { explanation, fixedSql, explanationUsage, fixedSqlUsage }
}

export async function fixSqlWithOpenAiStream(
  data: OpenAiFixSqlRequest & {
    onExplanationText?: (text: string) => void
    onSqlText?: (text: string) => void
    onReasoningText?: (text: string) => void
    /** Called after diagnosis finishes and before the fixed-SQL request starts. */
    onSqlPhaseStart?: () => void
  },
): Promise<OpenAiFixSqlResponse> {
  const { text: explanationText, usage: explanationUsage } = await requestOpenAiAssistantTextStream({
    openaiUrl: data.openaiUrl,
    openaiKey: data.openaiKey,
    model: data.model,
    prompt: buildFixExplanationPrompt({
      schema: data.schema,
      dialect: data.dialect ?? "postgresql",
      sql: data.sql,
      errorMessage: data.errorMessage,
    }),
    signal: data.signal,
    onText: data.onExplanationText,
    onReasoningText: data.onReasoningText,
  })

  data.onSqlPhaseStart?.()

  const { text: fixedSqlText, usage: fixedSqlUsage } = await requestOpenAiAssistantTextStream({
    openaiUrl: data.openaiUrl,
    openaiKey: data.openaiKey,
    model: data.model,
    prompt: buildFixSqlPrompt({
      schema: data.schema,
      dialect: data.dialect ?? "postgresql",
      sql: data.sql,
      errorMessage: data.errorMessage,
    }),
    signal: data.signal,
    onText: data.onSqlText,
    onReasoningText: data.onReasoningText,
  })

  const explanation = extractExplanationFromAssistantText(explanationText)
  const fixedSql = extractSqlFromAssistantText(fixedSqlText)
  if (!fixedSql) {
    throw new Error("OpenAI response missing `fixedSql` string")
  }
  return { explanation, fixedSql, explanationUsage, fixedSqlUsage }
}

export async function reviewSqlCorrectness(
  data: OpenAiReviewSqlCorrectnessRequest,
): Promise<OpenAiReviewSqlCorrectnessResponse> {
  const { text: assistantText } = await requestOpenAiAssistantText({
    openaiUrl: data.openaiUrl,
    openaiKey: data.openaiKey,
    model: data.model,
    prompt: buildCorrectnessReviewPrompt({
      schema: data.schema,
      dialect: data.dialect ?? "postgresql",
      humanQuery: data.humanQuery,
      sql: data.sql,
    }),
    signal: data.signal,
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
  const { text: assistantText } = await requestOpenAiAssistantText({
    openaiUrl: data.openaiUrl,
    openaiKey: data.openaiKey,
    model: data.model,
    prompt: buildOptimalityReviewPrompt({
      schema: data.schema,
      dialect: data.dialect ?? "postgresql",
      humanQuery: data.humanQuery,
      sql: data.sql,
    }),
    signal: data.signal,
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
  const { text: assistantText } = await requestOpenAiAssistantText({
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
    signal: data.signal,
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

export interface UpdateSecretValueRequest {
  secret_value: string
}

export async function updateSecretValue(
  projectId: string,
  resourceId: string,
  data: UpdateSecretValueRequest,
): Promise<SecretResponse> {
  return apiRequest<SecretResponse>({
    method: "PATCH",
    path: `/projects/${projectId}/resources/${resourceId}/secret`,
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
