import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { ChevronRight, MessagesSquare } from "lucide-react"
import { ApiError } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  lastExplanationStyle,
  useAiQueryChat,
  useDataExplorerSchema,
  useRunDatabaseQuery,
  type DataExplorerDatabaseNode,
} from "./hooks"
import { AiQueryChat } from "./components/ai-query-chat"
import { DataExplorerSchemaTree } from "./components/data-explorer-schema-tree"
import { DatabaseQueryResults } from "./components/database-query-results"
import type { RunDatabaseQueryResponse } from "./api"

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
  const schemaQuery = useDataExplorerSchema(id)
  const runQuery = useRunDatabaseQuery()
  const aiChat = useAiQueryChat()

  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null)
  const [sql, setSql] = useState("select 1;")
  const [result, setResult] = useState<RunDatabaseQueryResponse | null>(null)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)

  const nodes = schemaQuery.data ?? []

  const nl2sqlSchema = useMemo(() => {
    if (!selectedResourceId) return ""
    return buildNl2SqlSchemaSnapshot(nodes, selectedResourceId)
  }, [nodes, selectedResourceId])

  useEffect(() => {
    if (nodes.length === 0) return
    setSelectedResourceId((current) => {
      const ids = new Set(nodes.map((n) => n.database.resource_id))
      if (!current || !ids.has(current)) return nodes[0].database.resource_id
      return current
    })
  }, [nodes])

  const isSqlEmpty = sql.trim().length === 0

  async function handleRunQuery() {
    if (!selectedResourceId || isSqlEmpty || runQuery.isPending) return
    setResult(null)
    const response = await runQuery.mutateAsync({
      project_id: id,
      database_id: selectedResourceId,
      sql,
    })
    setResult(response)
  }

  if (schemaQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("dataExplorer.loadingSchema")}</p>
  }

  if (schemaQuery.isError) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-destructive">
          {getErrorMessage(schemaQuery.error, t("dataExplorer.schemaError"))}
        </p>
        <Button variant="outline" asChild>
          <Link to={`/projects/${id}?tab=databases`}>{t("dataExplorer.backToDatabases")}</Link>
        </Button>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t("dataExplorer.noDatabases")}</p>
        <Button variant="outline" asChild>
          <Link to={`/projects/${id}?tab=databases`}>{t("dataExplorer.backToDatabases")}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100dvh-10rem)] min-h-0 flex-col gap-4 overflow-hidden">
      {/* <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("dataExplorer.queryTitle", { databaseName: selectedName })}
        </h1>
      </div> */}

      <div className="flex min-h-0 min-w-0 flex-1 gap-0 overflow-hidden rounded-xl border border-border/70 bg-card">
        <DataExplorerSchemaTree
          nodes={nodes}
          selectedResourceId={selectedResourceId}
          onSelectDatabase={setSelectedResourceId}
          isSchemaRefetching={
            Boolean(schemaQuery.data) &&
            schemaQuery.fetchStatus === "fetching"
          }
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-5">
          <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-lg border border-border bg-card p-4">
            <div className="grid shrink-0 gap-2">
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
                className="min-h-[160px] font-mono"
                spellCheck={false}
              />
            </div>
            {runQuery.isError ? (
              <p className="text-sm text-destructive">
                {getErrorMessage(runQuery.error, t("databaseQuery.error"))}
              </p>
            ) : null}
            <div className="min-h-0 flex-1 overflow-auto">
              {result ? <DatabaseQueryResults result={result} /> : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
              <Button
                type="button"
                variant="secondary"
                disabled={!selectedResourceId || isSqlEmpty || aiChat.isPending}
                onClick={() => {
                  if (!aiPanelOpen) setAiPanelOpen(true)
                  void aiChat.sendMessage({
                    type: "explain",
                    message: sql.trim(),
                    style: lastExplanationStyle(aiChat.messages),
                  })
                }}
              >
                {aiChat.isPending ? t("dataExplorer.explaining") : t("dataExplorer.explain")}
              </Button>
              <Button
                type="button"
                disabled={isSqlEmpty || runQuery.isPending || !selectedResourceId}
                onClick={() => void handleRunQuery()}
              >
                {runQuery.isPending ? t("databaseQuery.running") : t("dataExplorer.runQuery")}
              </Button>
            </div>
          </div>
        </div>

        {aiPanelOpen ? (
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
              <AiQueryChat
                chat={aiChat}
                schema={nl2sqlSchema || undefined}
                dialect="postgresql"
                onApplySql={(next) => {
                  setSql(next)
                }}
                className="min-h-0 flex-1 overflow-hidden"
              />
            </div>
          </aside>
        ) : (
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
        )}
      </div>
    </div>
  )
}
