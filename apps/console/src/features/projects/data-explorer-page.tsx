import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { ApiError } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  useDataExplorerSchema,
  useGenerateNl2Sql,
  useRunDatabaseQuery,
  type DataExplorerDatabaseNode,
} from "./hooks"
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
  return text
}

export function DataExplorerPage() {
  const { t } = useTranslation()
  const { id = "" } = useParams<{ id: string }>()
  const schemaQuery = useDataExplorerSchema(id)
  const runQuery = useRunDatabaseQuery()
  const generateSql = useGenerateNl2Sql()

  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null)
  const [workspaceTab, setWorkspaceTab] = useState<"sql" | "human">("sql")
  const [sql, setSql] = useState("select 1;")
  const [humanPrompt, setHumanPrompt] = useState("")
  const [result, setResult] = useState<RunDatabaseQueryResponse | null>(null)

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
          <Tabs
            value={workspaceTab}
            onValueChange={(v) => {
              if (v === "sql" || v === "human") setWorkspaceTab(v)
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="shrink-0">
              <TabsTrigger value="sql">{t("dataExplorer.tabSql")}</TabsTrigger>
              <TabsTrigger value="human">{t("dataExplorer.tabHuman")}</TabsTrigger>
            </TabsList>

            <TabsContent value="sql" className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
              <div className="grid shrink-0 gap-2">
                <Label htmlFor="data-explorer-sql">{t("databaseQuery.sqlLabel")}</Label>
                <Textarea
                  id="data-explorer-sql"
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  className="min-h-[160px] font-mono"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">{t("databaseQuery.sqlHint")}</p>
              </div>
              {runQuery.isError ? (
                <p className="text-sm text-destructive">
                  {getErrorMessage(runQuery.error, t("databaseQuery.error"))}
                </p>
              ) : null}
              <div className="min-h-0 flex-1 overflow-auto">
                {result ? <DatabaseQueryResults result={result} /> : null}
              </div>
              <div className="flex shrink-0 justify-end border-t border-border pt-4">
                <Button
                  type="button"
                  disabled={isSqlEmpty || runQuery.isPending || !selectedResourceId}
                  onClick={() => void handleRunQuery()}
                >
                  {runQuery.isPending ? t("databaseQuery.running") : t("dataExplorer.runQuery")}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="human" className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
              <div className="grid min-h-0 flex-1 gap-2">
                <Label htmlFor="data-explorer-human">{t("dataExplorer.humanLabel")}</Label>
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
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
