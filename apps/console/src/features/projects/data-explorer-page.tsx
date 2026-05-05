import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Check, ChevronDown } from "lucide-react"
import { ApiError } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  useDataExplorerSchema,
  useExplainNl2Sql,
  useGenerateNl2Sql,
  useRunDatabaseQuery,
  type DataExplorerDatabaseNode,
} from "./hooks"
import { DataExplorerSchemaTree } from "./components/data-explorer-schema-tree"
import { DatabaseQueryResults } from "./components/database-query-results"
import type { RunDatabaseQueryResponse } from "./api"
import {
  EXPLAIN_STYLE_ORDER,
  explainStylePrompt,
  type ExplainStyleKey,
} from "./explain-styles"

const MAX_SCHEMA_CHARS = 190_000

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

function styleLabelKey(key: ExplainStyleKey): string {
  switch (key) {
    case "breakdown":
      return "dataExplorer.styleBreakdown"
    case "haiku":
      return "dataExplorer.styleHaiku"
    case "shakespeare":
      return "dataExplorer.styleShakespeare"
    case "snoopDog":
      return "dataExplorer.styleSnoopDog"
    case "stephenKing":
      return "dataExplorer.styleStephenKing"
    case "caveman":
      return "dataExplorer.styleCaveman"
    default: {
      const _x: never = key
      return _x
    }
  }
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
  const generateSql = useGenerateNl2Sql()
  const explainSql = useExplainNl2Sql()

  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null)
  const [workspaceTab, setWorkspaceTab] = useState<"sql" | "human">("sql")
  const [sql, setSql] = useState("select 1;")
  const [humanPrompt, setHumanPrompt] = useState("")
  const [result, setResult] = useState<RunDatabaseQueryResponse | null>(null)
  const [explainStyle, setExplainStyle] = useState<ExplainStyleKey>("breakdown")
  const [explanation, setExplanation] = useState<string | null>(null)

  const nodes = schemaQuery.data ?? []
  const selectedNode = selectedResourceId
    ? nodes.find((n) => n.database.resource_id === selectedResourceId)
    : undefined
  const selectedName = selectedNode?.database.name ?? t("dataExplorer.selectDatabase")

  useEffect(() => {
    if (nodes.length === 0) return
    setSelectedResourceId((current) => {
      const ids = new Set(nodes.map((n) => n.database.resource_id))
      if (!current || !ids.has(current)) return nodes[0].database.resource_id
      return current
    })
  }, [nodes])

  useEffect(() => {
    setExplanation(null)
  }, [selectedResourceId])

  const isSqlEmpty = sql.trim().length === 0
  const isHumanEmpty = humanPrompt.trim().length === 0

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

  async function handleGenerate() {
    if (!selectedResourceId || isHumanEmpty || generateSql.isPending) return
    const snapshot = buildNl2SqlSchemaSnapshot(nodes, selectedResourceId)
    const res = await generateSql.mutateAsync({
      question: humanPrompt,
      schema: snapshot,
      dialect: "postgresql",
    })
    setSql(res.sql)
    setWorkspaceTab("sql")
  }

  async function handleExplain() {
    if (!selectedResourceId || isSqlEmpty || explainSql.isPending) return
    setExplanation(null)
    try {
      const res = await explainSql.mutateAsync({
        sql: sql.trim(),
        style: explainStylePrompt(explainStyle),
      })
      setExplanation(res.explanation)
    } catch {
      return
    }
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
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col gap-4">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("dataExplorer.queryTitle", { databaseName: selectedName })}
        </h1>
      </div>

      <div className="flex min-h-0 flex-1 gap-0 overflow-hidden rounded-xl border border-border/70 bg-card">
        <DataExplorerSchemaTree
          nodes={nodes}
          selectedResourceId={selectedResourceId}
          onSelectDatabase={setSelectedResourceId}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-5">
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className="flex shrink-0 items-end gap-0.5 rounded-t-lg border border-border border-b-0 bg-muted/45 px-4 pt-2"
              role="tablist"
              aria-label={t("dataExplorer.workspaceTabsAria")}
            >
              <button
                type="button"
                role="tab"
                id="data-explorer-tab-sql"
                aria-selected={workspaceTab === "sql"}
                aria-controls="data-explorer-panel-sql"
                tabIndex={workspaceTab === "sql" ? 0 : -1}
                className={cn(
                  "relative rounded-t-md border border-transparent px-3 py-2 text-sm font-medium transition-colors",
                  workspaceTab === "sql"
                    ? "z-10 border-border border-b-card bg-card text-foreground shadow-[0_1px_0_0_var(--card)]"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                )}
                onClick={() => setWorkspaceTab("sql")}
              >
                {t("dataExplorer.tabSql")}
              </button>
              <button
                type="button"
                role="tab"
                id="data-explorer-tab-human"
                aria-selected={workspaceTab === "human"}
                aria-controls="data-explorer-panel-human"
                tabIndex={workspaceTab === "human" ? 0 : -1}
                className={cn(
                  "relative rounded-t-md border border-transparent px-3 py-2 text-sm font-medium transition-colors",
                  workspaceTab === "human"
                    ? "z-10 border-border border-b-card bg-card text-foreground shadow-[0_1px_0_0_var(--card)]"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                )}
                onClick={() => setWorkspaceTab("human")}
              >
                {t("dataExplorer.tabHuman")}
              </button>
            </div>

            <div
              className="flex min-h-0 flex-1 flex-col gap-4 rounded-b-lg border border-t-0 border-border bg-card p-4 pt-0"
              role="tabpanel"
              id={
                workspaceTab === "sql"
                  ? "data-explorer-panel-sql"
                  : "data-explorer-panel-human"
              }
              aria-labelledby={
                workspaceTab === "sql"
                  ? "data-explorer-tab-sql"
                  : "data-explorer-tab-human"
              }
            >
              {workspaceTab === "sql" ? (
                <>
                  <div className="grid shrink-0 gap-2">
                    {/* <Label htmlFor="data-explorer-sql">{t("databaseQuery.sqlLabel")}</Label> */}
                    <Textarea
                      id="data-explorer-sql"
                      value={sql}
                      onChange={(e) => setSql(e.target.value)}
                      className="min-h-[160px] font-mono"
                      spellCheck={false}
                    />
                    {/* <p className="text-xs text-muted-foreground">{t("databaseQuery.sqlHint")}</p> */}
                  </div>
                  {runQuery.isError ? (
                    <p className="text-sm text-destructive">
                      {getErrorMessage(runQuery.error, t("databaseQuery.error"))}
                    </p>
                  ) : null}
                  {explainSql.isError ? (
                    <p className="text-sm text-destructive">
                      {getErrorMessage(explainSql.error, t("dataExplorer.explainError"))}
                    </p>
                  ) : null}
                  {explanation !== null ? (
                    <div className="shrink-0 rounded-lg border border-border/70 bg-muted/30 p-3">
                      <p className="mb-2 text-sm font-medium">{t("dataExplorer.explanationTitle")}</p>
                      <div className="max-h-48 overflow-auto text-sm whitespace-pre-wrap text-muted-foreground">
                        {explanation}
                      </div>
                    </div>
                  ) : null}
                  <div className="min-h-0 flex-1 overflow-auto">
                    {result ? <DatabaseQueryResults result={result} /> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={explainSql.isPending}
                            className="gap-2"
                          >
                            <span className="max-w-[14rem] truncate text-left">
                              {t("dataExplorer.explainStyleLabel")}:{" "}
                              {t(styleLabelKey(explainStyle))}
                            </span>
                            <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {EXPLAIN_STYLE_ORDER.map((key) => (
                            <DropdownMenuItem
                              key={key}
                              className="gap-2"
                              onSelect={() => setExplainStyle(key)}
                            >
                              <span className="flex-1">{t(styleLabelKey(key))}</span>
                              {explainStyle === key ? (
                                <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
                              ) : null}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void handleExplain()}
                      >
                        {explainSql.isPending ? t("dataExplorer.explaining") : t("dataExplorer.explain")}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      disabled={isSqlEmpty || runQuery.isPending || !selectedResourceId}
                      onClick={() => void handleRunQuery()}
                    >
                      {runQuery.isPending ? t("databaseQuery.running") : t("dataExplorer.runQuery")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid min-h-0 flex-1 gap-2">
                    {/* <Label htmlFor="data-explorer-human">{t("dataExplorer.humanLabel")}</Label> */}
                    <Textarea
                      id="data-explorer-human"
                      value={humanPrompt}
                      onChange={(e) => setHumanPrompt(e.target.value)}
                      className="min-h-[200px] flex-1"
                      spellCheck
                    />
                  </div>
                  {generateSql.isError ? (
                    <p className="text-sm text-destructive">
                      {getErrorMessage(generateSql.error, t("dataExplorer.generateError"))}
                    </p>
                  ) : null}
                  <div className="flex shrink-0 justify-end border-t border-border pt-4">
                    <Button
                      type="button"
                      disabled={isHumanEmpty || generateSql.isPending || !selectedResourceId}
                      onClick={() => void handleGenerate()}
                    >
                      {generateSql.isPending
                        ? t("dataExplorer.generating")
                        : t("dataExplorer.generateQuery")}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
