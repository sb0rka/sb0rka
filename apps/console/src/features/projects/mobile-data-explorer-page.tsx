import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  ArrowUp,
  Bot,
  ChevronDown,
  ChevronRight,
  Code2,
  Database,
  Loader2,
  Table2,
  X,
} from "lucide-react"
import { ApiError } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { getResolvedLanguage } from "@/lib/i18n"
import {
  OPENAI_DEFAULT_MODEL,
  listAvailableOpenAiModels,
  revealSecretValue,
  type OpenAiModelInfo,
  type RunDatabaseQueryResponse,
} from "./api"
import {
  findLlmCredentialSecrets,
  hasRequiredLlmCredentialSecrets,
} from "./llm-credential-secrets"
import { AiQueryChat } from "./components/ai-query-chat"
import {
  loadMobileDataExplorerState,
  loadSelectedDatabaseId,
  MOBILE_DATA_EXPLORER_DEFAULT_SQL,
  saveMobileDataExplorerState,
  saveSelectedDatabaseId,
} from "./mobile-data-explorer-storage"
import {
  useAiQueryChat,
  useDatabases,
  useDataExplorerSchema,
  useRunDatabaseQuery,
  useSecrets,
  type DataExplorerDatabaseNode,
  type DataExplorerTableNode,
} from "./hooks"
import type { AiQueryChatMessage } from "./use-ai-query-chat"

const MAX_SCHEMA_CHARS = 190_000
const AI_SELECTED_MODEL_STORAGE_KEY = "sb0rka.console.aiSelectedModel"

type MobileExplorerPanel = "schema" | "sql" | "ai"

function getStoredAiSelectedModel(): string {
  if (typeof window === "undefined") return OPENAI_DEFAULT_MODEL
  const raw = window.localStorage.getItem(AI_SELECTED_MODEL_STORAGE_KEY)
  const normalized = raw?.trim() ?? ""
  return normalized.length > 0 ? normalized : OPENAI_DEFAULT_MODEL
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

function tableDisplayName(table: DataExplorerTableNode): string {
  return table.schema === "public" ? table.name : `${table.schema}.${table.name}`
}

function buildNl2SqlSchemaSnapshot(
  nodes: DataExplorerDatabaseNode[],
  resourceId: string,
): string {
  const node = nodes.find((n) => n.database.resource_id === resourceId)
  if (!node) return ""
  const lines: string[] = []

  for (const table of node.tables) {
    lines.push(`Table ${tableDisplayName(table)}:`)
    for (const column of table.columns) {
      const parts: string[] = [column.data_type]
      if (column.is_pk) parts.push("PK")
      parts.push(column.is_nullable ? "NULL" : "NOT NULL")
      lines.push(`  ${column.name} ${parts.join(" ")}`)
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

function formatQueryCellValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

export function MobileDataExplorerPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id = "" } = useParams<{ id: string }>()
  const locale = getResolvedLanguage()
  const databasesQuery = useDatabases(id)
  const schemaQuery = useDataExplorerSchema(id)
  const secretsQuery = useSecrets(id)
  const runQuery = useRunDatabaseQuery()

  const [activePanel, setActivePanel] = useState<MobileExplorerPanel>("schema")
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null)
  const [sql, setSql] = useState(MOBILE_DATA_EXPLORER_DEFAULT_SQL)
  const [result, setResult] = useState<RunDatabaseQueryResponse | null>(null)
  const [isResultsOpen, setIsResultsOpen] = useState(false)
  const [selectedAiModel, setSelectedAiModel] = useState(() => getStoredAiSelectedModel())
  const [chatRestoreKey, setChatRestoreKey] = useState("")
  const [chatInitialMessages, setChatInitialMessages] = useState<AiQueryChatMessage[]>([])
  const [aiDraftInput, setAiDraftInput] = useState("")
  const selectedResourceIdRef = useRef<string | null>(null)
  const skipNextPersistRef = useRef(false)

  const nodes = useMemo(() => {
    const databases = databasesQuery.data?.databases ?? []
    const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" })
    const sortedDatabases = [...databases].sort((a, b) =>
      collator.compare(a.name ?? "", b.name ?? ""),
    )
    const tablesByResourceId = new Map(
      (schemaQuery.data ?? []).map((node) => [node.database.resource_id, node.tables]),
    )

    return sortedDatabases.map((database) => ({
      database,
      tables: tablesByResourceId.get(database.resource_id) ?? [],
    }))
  }, [databasesQuery.data?.databases, locale, schemaQuery.data])

  useEffect(() => {
    if (nodes.length === 0) return
    setSelectedResourceId((current) => {
      const ids = new Set(nodes.map((node) => node.database.resource_id))
      const stored = loadSelectedDatabaseId(id)
      if (stored && ids.has(stored)) return stored
      if (!current || !ids.has(current)) return nodes[0].database.resource_id
      return current
    })
  }, [id, nodes])

  useEffect(() => {
    selectedResourceIdRef.current = selectedResourceId
  }, [selectedResourceId])

  useEffect(() => {
    if (!selectedResourceId) return

    skipNextPersistRef.current = true
    const storageKey = `${id}:${selectedResourceId}`
    const stored = loadMobileDataExplorerState(id, selectedResourceId)
    setSql(stored.sql)
    setResult(stored.result)
    setChatInitialMessages(stored.messages)
    setAiDraftInput(stored.aiDraftInput)
    setChatRestoreKey(storageKey)
    setIsResultsOpen(false)
    runQuery.reset()
    saveSelectedDatabaseId(id, selectedResourceId)
  }, [id, selectedResourceId])

  const selectedNode = useMemo(
    () => nodes.find((node) => node.database.resource_id === selectedResourceId),
    [nodes, selectedResourceId],
  )
  const nl2sqlSchema = useMemo(() => {
    if (!selectedResourceId) return ""
    return buildNl2SqlSchemaSnapshot(nodes, selectedResourceId)
  }, [nodes, selectedResourceId])

  const hasRequiredAiSecretNames = useMemo(
    () => hasRequiredLlmCredentialSecrets(secretsQuery.data?.secrets ?? []),
    [secretsQuery.data?.secrets],
  )

  const aiConfigQuery = useQuery({
    queryKey: ["projects", id, "mobileDataExplorer", "openaiConfig"],
    enabled: Boolean(id) && hasRequiredAiSecretNames,
    staleTime: 1000 * 60 * 30,
    queryFn: async (): Promise<{ openaiUrl: string; openaiKey: string }> => {
      const llmSecrets = findLlmCredentialSecrets(secretsQuery.data?.secrets ?? [])
      if (!llmSecrets) {
        throw new Error("Missing required secrets: LLM_BASE_URL/LLM_API_KEY")
      }

      const [openaiUrlResponse, openaiKeyResponse] = await Promise.all([
        revealSecretValue(id, llmSecrets.baseUrl.resource_id),
        revealSecretValue(id, llmSecrets.apiKey.resource_id),
      ])

      const openaiUrl = openaiUrlResponse.secret_value.trim()
      const openaiKey = openaiKeyResponse.secret_value.trim()
      if (!openaiUrl || !openaiKey) {
        throw new Error("Secrets LLM_BASE_URL/LLM_API_KEY must not be empty")
      }

      return { openaiUrl, openaiKey }
    },
  })

  const isAiAssistantAvailable = hasRequiredAiSecretNames && Boolean(aiConfigQuery.data)

  const aiModelsQuery = useQuery({
    queryKey: ["projects", id, "mobileDataExplorer", "openaiModels", aiConfigQuery.data?.openaiUrl],
    enabled: Boolean(aiConfigQuery.data?.openaiUrl && aiConfigQuery.data?.openaiKey),
    staleTime: 1000 * 60 * 15,
    queryFn: async () => {
      const openaiUrl = aiConfigQuery.data?.openaiUrl ?? ""
      const openaiKey = aiConfigQuery.data?.openaiKey ?? ""
      return listAvailableOpenAiModels({ openaiUrl, openaiKey })
    },
  })

  useEffect(() => {
    const available = aiModelsQuery.data
    if (!available || available.length === 0) return

    setSelectedAiModel((current) => {
      if (available.some((model) => model.id === current)) return current
      return available[0]?.id ?? OPENAI_DEFAULT_MODEL
    })
  }, [aiModelsQuery.data])

  const aiChat = useAiQueryChat({
    schema: nl2sqlSchema,
    dialect: "postgresql",
    openaiUrl: aiConfigQuery.data?.openaiUrl,
    openaiKey: aiConfigQuery.data?.openaiKey,
    selectedModel: selectedAiModel,
    restoreKey: chatRestoreKey,
    initialMessages: chatInitialMessages,
  })

  useEffect(() => {
    if (!selectedResourceId) return
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false
      return
    }

    saveMobileDataExplorerState(id, selectedResourceId, {
      sql,
      messages: aiChat.messages,
      result,
      aiDraftInput,
    })
  }, [id, selectedResourceId, sql, aiChat.messages, result, aiDraftInput])

  function handleAiModelSelect(model: string) {
    setSelectedAiModel(model)
    if (typeof window === "undefined") return
    const normalized = model.trim()
    if (!normalized) return
    window.localStorage.setItem(AI_SELECTED_MODEL_STORAGE_KEY, normalized)
  }

  const insertIntoSql = useCallback((text: string) => {
    if (!text) return
    setSql((current) => {
      const needsSpace = current.length > 0 && !/\s$/.test(current)
      return `${current}${needsSpace ? " " : ""}${text}`
    })
    setActivePanel("sql")
  }, [])

  async function handleRunQuery(sqlOverride?: string) {
    const sqlToRun = (sqlOverride ?? sql).trim()
    const databaseId = selectedResourceId
    if (!databaseId || sqlToRun.length === 0 || runQuery.isPending) return

    setResult(null)
    try {
      const response = await runQuery.mutateAsync({
        project_id: id,
        database_id: databaseId,
        query: sqlToRun,
      })
      if (selectedResourceIdRef.current !== databaseId) return
      setResult(response)
      setIsResultsOpen(true)
    } catch {
      setActivePanel("sql")
    }
  }

  function handleClose() {
    navigate(`/projects/${id}?tab=databases`)
  }

  function handleSelectDatabase(resourceId: string) {
    setSelectedResourceId(resourceId)
  }

  return (
    <div className="flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-x-hidden overflow-y-hidden bg-background text-foreground">
      <MobileExplorerHeader
        nodes={nodes}
        selectedResourceId={selectedResourceId}
        activePanel={activePanel}
        isQueryRunning={runQuery.isPending}
        databasesLoading={databasesQuery.isLoading}
        onSelectDatabase={handleSelectDatabase}
        onSelectPanel={setActivePanel}
        onClose={handleClose}
      />

      <main className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden overflow-y-hidden px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        {databasesQuery.isLoading ? (
          <MobileExplorerStateMessage message={t("common.loading")} />
        ) : databasesQuery.isError ? (
          <MobileExplorerStateMessage
            tone="error"
            message={getErrorMessage(databasesQuery.error, t("databases.loadError"))}
          />
        ) : nodes.length === 0 ? (
          <MobileExplorerStateMessage message={t("dataExplorer.noDatabases")} />
        ) : activePanel === "schema" ? (
          <MobileSchemaPanel
            node={selectedNode}
            isLoading={schemaQuery.isLoading}
            isFetching={schemaQuery.isFetching}
            isError={schemaQuery.isError}
            errorMessage={getErrorMessage(schemaQuery.error, t("dataExplorer.schemaError"))}
            onInsertSql={insertIntoSql}
          />
        ) : activePanel === "sql" ? (
          <MobileSqlPanel
            sql={sql}
            onSqlChange={setSql}
            isRunning={runQuery.isPending}
            hasResult={result !== null}
            onViewResults={() => setIsResultsOpen(true)}
            errorMessage={
              runQuery.isError
                ? getErrorMessage(runQuery.error, t("databaseQuery.error"))
                : undefined
            }
            canFix={isAiAssistantAvailable && sql.trim().length > 0}
            isFixing={aiChat.isPending}
            onRun={() => void handleRunQuery()}
            onFix={() => {
              if (!runQuery.error) return
              setActivePanel("ai")
              void aiChat.sendMessage({
                type: "fix",
                sql: sql.trim(),
                errorMessage: getErrorMessage(runQuery.error, t("databaseQuery.error")),
                schema: nl2sqlSchema,
                dialect: "postgresql",
              })
            }}
          />
        ) : (
          <MobileAiPanel
            chat={aiChat}
            configured={isAiAssistantAvailable}
            configLoading={hasRequiredAiSecretNames && aiConfigQuery.isLoading}
            configError={
              aiConfigQuery.isError
                ? t("dataExplorer.mobileAiConfigError")
                : undefined
            }
            missingConfig={!hasRequiredAiSecretNames}
            availableModels={aiModelsQuery.data ?? []}
            selectedModel={selectedAiModel}
            modelsLoading={aiModelsQuery.isLoading}
            modelsRefreshing={aiModelsQuery.isFetching && !aiModelsQuery.isLoading}
            modelsError={aiModelsQuery.isError}
            onModelSelect={handleAiModelSelect}
            onRefreshModels={() => void aiModelsQuery.refetch()}
            schema={nl2sqlSchema}
            dialect="postgresql"
            hasResult={result !== null}
            onViewResults={() => setIsResultsOpen(true)}
            aiDraftInput={aiDraftInput}
            onAiDraftInputChange={setAiDraftInput}
            onApplySql={(next) => {
              setSql(next)
              setActivePanel("sql")
            }}
            onApplySqlAndRun={(next) => {
              setSql(next)
              void handleRunQuery(next)
            }}
            applySqlAndRunDisabled={!selectedResourceId || runQuery.isPending}
            isQueryRunning={runQuery.isPending}
          />
        )}
      </main>

      <MobileResultsDialog
        result={result}
        open={isResultsOpen}
        onOpenChange={setIsResultsOpen}
      />
    </div>
  )
}

function MobileExplorerHeader({
  nodes,
  selectedResourceId,
  activePanel,
  isQueryRunning,
  databasesLoading,
  onSelectDatabase,
  onSelectPanel,
  onClose,
}: {
  nodes: DataExplorerDatabaseNode[]
  selectedResourceId: string | null
  activePanel: MobileExplorerPanel
  isQueryRunning: boolean
  databasesLoading: boolean
  onSelectDatabase: (resourceId: string) => void
  onSelectPanel: (panel: MobileExplorerPanel) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const selectedName =
    nodes.find((node) => node.database.resource_id === selectedResourceId)?.database.name ??
    t("dataExplorer.selectDatabase")
  const sqlTabLabel = isQueryRunning ? t("databaseQuery.running") : t("dataExplorer.tabSql")

  return (
    <header className="flex w-full min-w-0 shrink-0 items-center gap-2 overflow-hidden border-b border-border bg-card px-3 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="min-w-0 flex-1 justify-between gap-2 rounded-full px-3"
            disabled={databasesLoading || nodes.length === 0}
            aria-label={t("dataExplorer.selectDatabase")}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Database className="h-4 w-4 shrink-0" />
              <span className="truncate">{databasesLoading ? t("common.loading") : selectedName}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[60vh] w-[calc(100dvw-1.5rem)] overflow-y-auto">
          {nodes.map((node) => (
            <DropdownMenuItem
              key={node.database.resource_id}
              onSelect={() => onSelectDatabase(node.database.resource_id)}
              className="gap-2"
            >
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{node.database.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <MobileHeaderIcon
        active={activePanel === "schema"}
        label={t("dataExplorer.schemaTitle")}
        onClick={() => onSelectPanel("schema")}
      >
        <Table2 className="h-4 w-4" />
      </MobileHeaderIcon>
      <MobileHeaderIcon
        active={activePanel === "sql"}
        busy={isQueryRunning}
        label={sqlTabLabel}
        onClick={() => onSelectPanel("sql")}
      >
        {isQueryRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Code2 className="h-4 w-4" />}
      </MobileHeaderIcon>
      <MobileHeaderIcon
        active={activePanel === "ai"}
        label={t("dataExplorer.aiChatTitle")}
        onClick={() => onSelectPanel("ai")}
      >
        <Bot className="h-4 w-4" />
      </MobileHeaderIcon>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 rounded-full"
        onClick={onClose}
        aria-label={t("common.actions.cancel")}
      >
        <X className="h-4 w-4" />
      </Button>
    </header>
  )
}

function MobileHeaderIcon({
  active,
  busy = false,
  label,
  onClick,
  children,
}: {
  active: boolean
  busy?: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "ghost"}
      size="icon"
      className={cn(
        "h-9 w-9 shrink-0 rounded-full",
        busy && !active && "animate-pulse text-primary",
      )}
      onClick={onClick}
      aria-label={label}
    >
      {children}
    </Button>
  )
}

function MobileExplorerStateMessage({
  message,
  tone = "muted",
}: {
  message: string
  tone?: "muted" | "error"
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed border-border px-5 text-center">
      <p className={cn("text-sm", tone === "error" ? "text-destructive" : "text-muted-foreground")}>
        {message}
      </p>
    </div>
  )
}

function MobileSchemaPanel({
  node,
  isLoading,
  isFetching,
  isError,
  errorMessage,
  onInsertSql,
}: {
  node?: DataExplorerDatabaseNode
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  errorMessage: string
  onInsertSql: (text: string) => void
}) {
  const { t } = useTranslation()
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setExpandedTables({})
  }, [node?.database.resource_id])

  if (isLoading) {
    return <MobileExplorerStateMessage message={t("dataExplorer.loadingSchema")} />
  }
  if (isError) {
    return <MobileExplorerStateMessage tone="error" message={errorMessage} />
  }
  if (!node) {
    return <MobileExplorerStateMessage message={t("dataExplorer.noDatabases")} />
  }

  return (
    <section className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-6">{t("dataExplorer.schemaTitle")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("dataExplorer.mobileSchemaTables", { count: node.tables.length })}
          </p>
        </div>
        {isFetching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        {node.tables.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {t("dataExplorer.mobileSchemaEmpty")}
          </p>
        ) : (
          <ul>
            {node.tables.map((table) => {
              const key = `${table.schema}.${table.name}`
              const isOpen = expandedTables[key] ?? false
              const displayName = tableDisplayName(table)

              return (
                <li key={key}>
                  <button
                    type="button"
                    className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                    onClick={() =>
                      setExpandedTables((current) => ({
                        ...current,
                        [key]: !isOpen,
                      }))
                    }
                    aria-expanded={isOpen}
                  >
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-90",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">{displayName}</span>
                  </button>

                  {isOpen ? (
                    <ul className="ml-9 border-l border-border/60 py-0.5 pl-2 pr-3">
                      {table.columns.map((column) => (
                        <li key={column.name} className="py-px">
                          <button
                            type="button"
                            className="w-full min-w-0 whitespace-normal break-words rounded-sm px-1 py-0.5 text-left font-mono text-[11px] leading-snug text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                            onClick={() => onInsertSql(column.name)}
                          >
                            <span className="text-foreground">{column.name}</span>
                            <span className="text-muted-foreground">
                              {" · "}
                              {column.data_type}
                              {column.is_pk ? " pk" : ""}
                              {column.is_nullable ? "" : " nn"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

function MobileSqlPanel({
  sql,
  onSqlChange,
  isRunning,
  hasResult,
  onViewResults,
  errorMessage,
  canFix,
  isFixing,
  onRun,
  onFix,
}: {
  sql: string
  onSqlChange: (sql: string) => void
  isRunning: boolean
  hasResult: boolean
  onViewResults: () => void
  errorMessage?: string
  canFix: boolean
  isFixing: boolean
  onRun: () => void
  onFix: () => void
}) {
  const { t } = useTranslation()
  const isSqlEmpty = sql.trim().length === 0

  return (
    <section className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold leading-6">{t("dataExplorer.tabSql")}</h1>
        {hasResult ? (
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onViewResults}>
            {t("dataExplorer.viewLastResults")}
          </Button>
        ) : null}
      </div>

      <div className="relative min-h-0 min-w-0 w-full max-w-full flex-1 overflow-hidden">
        <Textarea
          value={sql}
          onChange={(event) => onSqlChange(event.target.value)}
          className="h-full min-h-full w-full min-w-0 max-w-full resize-none rounded-2xl p-4 pr-14 font-mono shadow-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          spellCheck={false}
          aria-label={t("databaseQuery.sqlLabel")}
        />
        <Button
          type="button"
          size="icon"
          className={cn(
            "absolute bottom-3 right-3 h-10 w-10 rounded-full shadow-sm",
            isRunning && "animate-pulse",
          )}
          disabled={isSqlEmpty || isRunning}
          onClick={onRun}
          aria-label={isRunning ? t("databaseQuery.running") : t("dataExplorer.runQuery")}
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-5 w-5" strokeWidth={3} />
          )}
        </Button>
      </div>

      {errorMessage ? (
        <div className="shrink-0 rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">{t("dataExplorer.queryFailedTitle")}</p>
          <p className="mt-1 break-words text-sm text-destructive/90">{errorMessage}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={!canFix || isFixing}
            onClick={onFix}
          >
            {isFixing ? t("dataExplorer.fixing") : t("dataExplorer.fix")}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function MobileAiPanel({
  chat,
  configured,
  configLoading,
  configError,
  missingConfig,
  availableModels,
  selectedModel,
  modelsLoading,
  modelsRefreshing,
  modelsError,
  onModelSelect,
  onRefreshModels,
  schema,
  dialect,
  onApplySql,
  onApplySqlAndRun,
  applySqlAndRunDisabled,
  isQueryRunning,
  hasResult,
  onViewResults,
  aiDraftInput,
  onAiDraftInputChange,
}: {
  chat: ReturnType<typeof useAiQueryChat>
  configured: boolean
  configLoading: boolean
  configError?: string
  missingConfig: boolean
  availableModels: OpenAiModelInfo[]
  selectedModel: string
  modelsLoading: boolean
  modelsRefreshing: boolean
  modelsError: boolean
  onModelSelect: (model: string) => void
  onRefreshModels: () => void
  schema: string
  dialect: string
  onApplySql: (sql: string) => void
  onApplySqlAndRun: (sql: string) => void
  applySqlAndRunDisabled: boolean
  isQueryRunning: boolean
  hasResult: boolean
  onViewResults: () => void
  aiDraftInput: string
  onAiDraftInputChange: (value: string) => void
}) {
  const { t } = useTranslation()

  return (
    <section className="flex min-h-0 min-w-0 w-full flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <h1 className="text-lg font-semibold leading-6">{t("dataExplorer.aiChatTitle")}</h1>
        {hasResult ? (
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onViewResults}>
            {t("dataExplorer.viewLastResults")}
          </Button>
        ) : null}
      </div>

      {missingConfig ? (
        <MobileInlineNotice className="shrink-0" message={t("dataExplorer.mobileAiMissingConfig")} />
      ) : null}
      {configLoading ? (
        <MobileInlineNotice className="shrink-0" message={t("dataExplorer.mobileAiConfigLoading")} />
      ) : null}
      {configError ? (
        <MobileInlineNotice className="shrink-0" tone="error" message={configError} />
      ) : null}

      <AiQueryChat
        chat={chat}
        availableModels={availableModels}
        selectedModel={selectedModel}
        modelsLoading={modelsLoading}
        modelsRefreshing={modelsRefreshing}
        modelsError={modelsError}
        onModelSelect={onModelSelect}
        onRefreshModels={onRefreshModels}
        schema={schema || undefined}
        dialect={dialect}
        onApplySql={onApplySql}
        onApplySqlAndRun={onApplySqlAndRun}
        applySqlAndRunDisabled={applySqlAndRunDisabled}
        isQueryRunning={isQueryRunning}
        inputDisabled={!configured}
        draftInput={aiDraftInput}
        onDraftInputChange={onAiDraftInputChange}
        className="min-h-0 min-w-0 w-full flex-1 overflow-hidden"
      />
    </section>
  )
}

function MobileInlineNotice({
  message,
  tone = "muted",
  className,
}: {
  message: string
  tone?: "muted" | "error"
  className?: string
}) {
  return (
    <p
      className={cn(
        "rounded-2xl border px-3 py-2 text-sm",
        tone === "error"
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-border bg-muted/40 text-muted-foreground",
        className,
      )}
    >
      {message}
    </p>
  )
}

function MobileResultsDialog({
  result,
  open,
  onOpenChange,
}: {
  result: RunDatabaseQueryResponse | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!fixed !inset-0 !left-0 !top-0 !flex !h-dvh !max-h-dvh !w-full !max-w-[100dvw] !translate-x-0 !translate-y-0 flex-col overflow-hidden rounded-none border-0 p-0 data-[state=closed]:animate-none data-[state=open]:animate-none [&>button]:hidden">
        <DialogHeader className="relative z-20 shrink-0 border-b border-border bg-background px-4 pb-3 pt-[calc(1rem+env(safe-area-inset-top))]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-xl">{t("databaseQuery.fullscreenTitle")}</DialogTitle>
              <DialogDescription>
                {result
                  ? `${t("databaseQuery.rowCount", { count: result.row_count })} · ${t("databaseQuery.duration", { duration: result.duration_ms })}`
                  : t("common.loading")}
                {result?.truncated ? ` · ${t("databaseQuery.truncated")}` : ""}
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full"
                aria-label={t("common.actions.cancel")}
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto bg-background">
          {!result ? null : result.rows.length === 0 ? (
            <p className="m-4 rounded-2xl border border-border px-4 py-3 text-sm text-muted-foreground">
              {t("databaseQuery.empty")}
            </p>
          ) : (
            <table className="w-full min-w-max border-separate border-spacing-0 text-left text-sm">
              <thead className="sticky top-0 z-10 bg-card text-muted-foreground">
                <tr>
                  {result.columns.map((column, columnIndex) => (
                    <th
                      key={`${column}-${columnIndex}`}
                      className="border-b border-r border-border px-3 py-2 text-xs font-semibold last:border-r-0"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className={rowIndex % 2 === 0 ? "bg-background" : "bg-muted/35"}>
                    {result.columns.map((column, columnIndex) => (
                      <td
                        key={`${rowIndex}-${column}-${columnIndex}`}
                        className="max-w-[260px] truncate border-b border-r border-border px-3 py-2 font-mono text-xs last:border-r-0"
                        title={formatQueryCellValue(row[columnIndex])}
                      >
                        {formatQueryCellValue(row[columnIndex])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
