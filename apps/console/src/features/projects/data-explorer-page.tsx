import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { ChevronRight, MessagesSquare } from "lucide-react"
import { ApiError } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  useAiQueryChat,
  useDatabases,
  useDataExplorerSchema,
  useRunDatabaseQuery,
  useSecrets,
  type DataExplorerDatabaseNode,
} from "./hooks"
import { AiQueryChat } from "./components/ai-query-chat"
import { DataExplorerQueryError } from "./components/data-explorer-query-error"
import { DataExplorerSchemaTree } from "./components/data-explorer-schema-tree"
import { DatabaseQueryResults } from "./components/database-query-results"
import { revealSecretValue, type RunDatabaseQueryResponse, type SecretResponse } from "./api"

const MAX_SCHEMA_CHARS = 190_000

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

function buildNl2SqlSchemaSnapshot(
  nodes: DataExplorerDatabaseNode[],
  resourceId: string,
): string {
  const node = nodes.find((n) => n.database.resource_id === resourceId)
  if (!node) return ""
  const lines: string[] = []
  for (const table of node.tables) {
    const qualified = table.schema === "public" ? table.name : `${table.schema}.${table.name}`
    lines.push(`Table ${qualified}:`)
    for (const c of table.columns) {
      const parts: string[] = [c.data_type]
      if (c.is_pk) parts.push("PK")
      parts.push(c.is_nullable ? "NULL" : "NOT NULL")
      lines.push(`  ${c.name} ${parts.join(" ")}`)
    }
    lines.push("")
  }
  let text = lines.join("\n").trim()
  if (text.length > MAX_SCHEMA_CHARS) {
    text = `${text.slice(0, MAX_SCHEMA_CHARS)}\n(truncated)`
  }
  if (text.length === 0) return ""
  return (
    "This listing was produced by live PostgreSQL introspection of the connected database.\n\n" +
    text
  )
}

export function DataExplorerPage() {
  const { t } = useTranslation()
  const { id = "" } = useParams<{ id: string }>()
  const databasesQuery = useDatabases(id)
  const schemaQuery = useDataExplorerSchema(id)
  const secretsQuery = useSecrets(id)
  const runQuery = useRunDatabaseQuery()

  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null)
  const [sql, setSql] = useState("select 1;")
  const [result, setResult] = useState<RunDatabaseQueryResponse | null>(null)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)

  const nodes = useMemo(() => {
    const databases = databasesQuery.data?.databases ?? []
    const tablesByResourceId = new Map(
      (schemaQuery.data ?? []).map((node) => [node.database.resource_id, node.tables]),
    )
    return databases.map((database) => ({
      database,
      tables: tablesByResourceId.get(database.resource_id) ?? [],
    }))
  }, [databasesQuery.data?.databases, schemaQuery.data])
  const nl2sqlSchema = useMemo(() => {
    if (!selectedResourceId) return ""
    return buildNl2SqlSchemaSnapshot(nodes, selectedResourceId)
  }, [nodes, selectedResourceId])
  const selectedName = useMemo(() => {
    if (!selectedResourceId) return ""
    return nodes.find((node) => node.database.resource_id === selectedResourceId)?.database.name ?? ""
  }, [nodes, selectedResourceId])
  const hasRequiredAiSecretNames = useMemo(() => {
    const required = new Set(["openaiurl", "openaikey"])
    const names = new Set(
      (secretsQuery.data?.secrets ?? []).map((secret) => secret.name.trim().toLowerCase()),
    )
    return [...required].every((name) => names.has(name))
  }, [secretsQuery.data?.secrets])

  const aiConfigQuery = useQuery({
    queryKey: ["projects", id, "dataExplorer", "openaiConfig"],
    enabled: Boolean(id) && hasRequiredAiSecretNames,
    staleTime: 1000 * 60 * 30,
    queryFn: async (): Promise<{ openaiUrl: string; openaiKey: string }> => {
      const byName = new Map<string, SecretResponse>()
      for (const secret of secretsQuery.data?.secrets ?? []) {
        byName.set(secret.name.trim().toLowerCase(), secret)
      }

      const openaiUrlSecret = byName.get("openaiurl")
      const openaiKeySecret = byName.get("openaikey")
      if (!openaiUrlSecret || !openaiKeySecret) {
        throw new Error("Missing required secrets: openaiurl/openaikey")
      }

      const [openaiUrlResponse, openaiKeyResponse] = await Promise.all([
        revealSecretValue(id, openaiUrlSecret.resource_id),
        revealSecretValue(id, openaiKeySecret.resource_id),
      ])

      const openaiUrl = openaiUrlResponse.secret_value.trim()
      const openaiKey = openaiKeyResponse.secret_value.trim()
      if (!openaiUrl || !openaiKey) {
        throw new Error("Secrets openaiurl/openaikey must not be empty")
      }

      return { openaiUrl, openaiKey }
    },
  })

  const isAiAssistantAvailable = hasRequiredAiSecretNames && Boolean(aiConfigQuery.data)

  const aiChat = useAiQueryChat({
    schema: nl2sqlSchema,
    dialect: "postgresql",
    openaiUrl: aiConfigQuery.data?.openaiUrl,
    openaiKey: aiConfigQuery.data?.openaiKey,
  })
  const wasAiAssistantAvailableRef = useRef(false)

  useEffect(() => {
    if (nodes.length === 0) return
    setSelectedResourceId((current) => {
      const ids = new Set(nodes.map((n) => n.database.resource_id))
      if (!current || !ids.has(current)) return nodes[0].database.resource_id
      return current
    })
  }, [nodes])

  useEffect(() => {
    if (!hasRequiredAiSecretNames) {
      wasAiAssistantAvailableRef.current = false
      setAiPanelOpen(false)
      aiChat.reset()
      return
    }
    if (!wasAiAssistantAvailableRef.current) {
      setAiPanelOpen(true)
    }
    wasAiAssistantAvailableRef.current = true
  }, [aiChat.reset, hasRequiredAiSecretNames])

  const isSqlEmpty = sql.trim().length === 0

  async function handleRunQuery(sqlOverride?: string) {
    const sqlToRun = (sqlOverride ?? sql).trim()
    if (!selectedResourceId || sqlToRun.length === 0 || runQuery.isPending) return
    setResult(null)
    try {
      const response = await runQuery.mutateAsync({
        project_id: id,
        database_id: selectedResourceId,
        query: sqlToRun,
      })
      setResult(response)
    } catch {
      // Rejection from mutateAsync; failure is already on runQuery for the UI below.
    }
  }

  return (
    <div className="flex h-[calc(100dvh-10rem)] min-h-0 flex-col gap-4 overflow-hidden">

      <div className="flex min-h-0 min-w-0 flex-1 gap-0 overflow-hidden rounded-xl border border-border/70 bg-card">
        <DataExplorerSchemaTree
          nodes={nodes}
          selectedResourceId={selectedResourceId}
          onSelectDatabase={setSelectedResourceId}
          isSchemaRefetching={
            Boolean(schemaQuery.data) &&
            schemaQuery.fetchStatus === "fetching"
          }
          projectId={id}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-5">
          {nodes.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-lg border-border bg-card p-4">
              {databasesQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">{t("dataExplorer.loadingSchema")}</p>
              ) : databasesQuery.isError ? (
                <>
                  <p className="text-sm text-destructive">
                    {getErrorMessage(databasesQuery.error, t("dataExplorer.schemaError"))}
                  </p>
                  <Button variant="outline" asChild>
                    <Link to={`/projects/${id}?tab=databases`}>{t("dataExplorer.backToDatabases")}</Link>
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">{t("dataExplorer.noDatabases")}</p>
                  <Button variant="outline" asChild>
                    <Link to={`/projects/${id}?tab=databases`}>{t("dataExplorer.backToDatabases")}</Link>
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-lg border-border bg-card p-4">
              {schemaQuery.isError ? (
                <p className="text-sm text-destructive">
                  {getErrorMessage(schemaQuery.error, t("dataExplorer.schemaError"))}
                </p>
              ) : null}
              <div className="grid shrink-0 gap-4">
                <div className="flex items-center gap-1">
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <p className="text-lg font-medium text-foreground">
                    {selectedName || "—"}
                  </p>
                </div>
                <Textarea
                  id="data-explorer-sql"
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || e.shiftKey) return
                    if (e.nativeEvent.isComposing) return
                    e.preventDefault()
                    void handleRunQuery()
                  }}
                  className="min-h-[240px] font-mono"
                  spellCheck={false}
                />
              </div>
              {runQuery.isError ? (
                <DataExplorerQueryError
                  title={t("dataExplorer.queryFailedTitle")}
                  message={getErrorMessage(runQuery.error, t("databaseQuery.error"))}
                  fixLabel={t("dataExplorer.fix")}
                  fixPendingLabel={t("dataExplorer.fixing")}
                  fixDisabled={!isAiAssistantAvailable || !selectedResourceId || isSqlEmpty}
                  fixPending={aiChat.isPending}
                  onFix={() => {
                    if (!isAiAssistantAvailable) return
                    if (!aiPanelOpen) setAiPanelOpen(true)
                    void aiChat.sendMessage({
                      type: "fix",
                      sql: sql.trim(),
                      errorMessage: getErrorMessage(
                        runQuery.error,
                        t("databaseQuery.error"),
                      ),
                      schema: nl2sqlSchema,
                      dialect: "postgresql",
                    })
                  }}
                />
              ) : null}
              <div className="min-h-0 flex-1 overflow-auto">
                {result ? <DatabaseQueryResults result={result} /> : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
                <Button
                  type="button"
                  disabled={isSqlEmpty || runQuery.isPending || !selectedResourceId}
                  onClick={() => void handleRunQuery()}
                >
                  {runQuery.isPending ? t("databaseQuery.running") : t("dataExplorer.runQuery")}
                </Button>
              </div>
            </div>
          )}
        </div>

        {hasRequiredAiSecretNames
          ? aiPanelOpen
            ? (
                <aside
                  className="flex min-h-0 w-[min(100%,22rem)] shrink-0 flex-col overflow-hidden border-l border-border bg-muted/15"
                  aria-label={t("dataExplorer.aiChatTitle")}
                >
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
                    <span className="truncate text-sm font-medium">{t("dataExplorer.aiChatTitle")}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => setAiPanelOpen(false)}
                      aria-label={t("dataExplorer.collapseAiPanel")}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
                    {aiConfigQuery.isLoading ? (
                      <p className="mb-2 text-sm text-muted-foreground">
                        Loading OpenAI configuration from secrets...
                      </p>
                    ) : null}
                    {aiConfigQuery.isError ? (
                      <p className="mb-2 text-sm text-destructive" role="alert">
                        {getErrorMessage(
                          aiConfigQuery.error,
                          "Failed to load OpenAI configuration from secrets.",
                        )}
                      </p>
                    ) : null}
                    <AiQueryChat
                      chat={aiChat}
                      schema={nl2sqlSchema || undefined}
                      dialect="postgresql"
                      onApplySql={(next) => {
                        setSql(next)
                      }}
                      onApplySqlAndRun={(next) => {
                        setSql(next)
                        void handleRunQuery(next)
                      }}
                      applySqlAndRunDisabled={!selectedResourceId || runQuery.isPending}
                      className="min-h-0 flex-1 overflow-hidden"
                    />
                  </div>
                </aside>
              )
            : (
                <div className="flex w-10 shrink-0 flex-col border-l border-border bg-muted/20">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-full shrink-0 rounded-none rounded-tl-lg border-b border-border/70"
                    onClick={() => setAiPanelOpen(true)}
                    aria-label={t("dataExplorer.expandAiPanel")}
                  >
                    <MessagesSquare className="h-4 w-4" />
                  </Button>
                </div>
              )
          : null}
      </div>
    </div>
  )
}
