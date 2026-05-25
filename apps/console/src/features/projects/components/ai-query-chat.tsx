import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ClipboardPaste,
  Copy,
  Loader2,
  Play,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  EXPLAIN_STYLE_ORDER,
  explainStyleKeyFromPrompt,
  explainStylePrompt,
  type ExplainStyleKey,
} from "../explain-styles"
import { type OpenAiModelInfo, type OpenAiModelPricing } from "../api"
import {
  type AiQueryChatMessage,
  type AiQueryChatSendPayload,
  type AiReasoningLevel,
} from "../use-ai-query-chat"

function toMicroDollarString(value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return "-"
  return `${(n * 1_000_000).toFixed(3)}u`
}

function modelTotalPrice(pricing: OpenAiModelPricing | undefined): number | null {
  if (!pricing) return null
  const prompt = Number(pricing.prompt)
  const completion = Number(pricing.completion)
  if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return null
  return prompt + completion
}

type ModelSortKey = "id" | "name" | "priceAsc" | "priceDesc"

const MODEL_SORT_OPTIONS: readonly ModelSortKey[] = [
  "name",
  "id",
  "priceAsc",
  "priceDesc",
] as const

function compareModelsByPrice(
  a: OpenAiModelInfo,
  b: OpenAiModelInfo,
  direction: "asc" | "desc",
): number {
  const pa = modelTotalPrice(a.pricing)
  const pb = modelTotalPrice(b.pricing)
  if (pa === null && pb === null) return a.id.localeCompare(b.id)
  if (pa === null) return 1
  if (pb === null) return -1
  const diff = pa - pb
  if (diff !== 0) return direction === "asc" ? diff : -diff
  return a.id.localeCompare(b.id)
}

function modelSortLabelKey(key: ModelSortKey): string {
  switch (key) {
    case "name":
      return "dataExplorer.aiChatMenuSortByName"
    case "id":
      return "dataExplorer.aiChatMenuSortById"
    case "priceAsc":
      return "dataExplorer.aiChatMenuSortByPriceAsc"
    case "priceDesc":
      return "dataExplorer.aiChatMenuSortByPriceDesc"
    default: {
      const _x: never = key
      return _x
    }
  }
}

function scrollElementIntoScrollParent(container: HTMLElement, element: HTMLElement): void {
  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const relativeTop = elementRect.top - containerRect.top + container.scrollTop
  const relativeBottom = relativeTop + elementRect.height
  const viewTop = container.scrollTop
  const viewBottom = viewTop + container.clientHeight

  if (relativeTop < viewTop) {
    container.scrollTop = relativeTop
  } else if (relativeBottom > viewBottom) {
    container.scrollTop = relativeBottom - container.clientHeight
  }
}

function pricingIndicator(pricing: OpenAiModelPricing | undefined): string {
  if (!pricing) return "-"
  const prompt = Number(pricing.prompt)
  const completion = Number(pricing.completion)
  if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return "-"
  return toMicroDollarString(String(prompt + completion))
}

function pricingHoverText(modelId: string, pricing: OpenAiModelPricing | undefined): string {
  if (!pricing) return modelId
  const lines = [
    modelId,
    "pricing:",
    `  prompt: ${pricing.prompt}`,
    `  completion: ${pricing.completion}`,
  ]
  if (pricing.input_cache_read) {
    lines.push(`  input_cache_read: ${pricing.input_cache_read}`)
  }
  return lines.join("\n")
}

function explainStyleLabelKey(key: ExplainStyleKey): string {
  switch (key) {
    case "none":
      return "dataExplorer.styleNone"
    case "detailed":
      return "dataExplorer.styleDetailed"
    case "short":
      return "dataExplorer.styleShort"
    case "haiku":
      return "dataExplorer.styleHaiku"
    default: {
      const _x: never = key
      return _x
    }
  }
}

const EXPLANATION_STYLE_STORAGE_KEY = "ai-query-chat:explanation-style"

const aiChatMenuTriggerClass =
  "focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"

export type AiQueryChatController = {
  messages: AiQueryChatMessage[]
  isPending: boolean
  error: string | null
  lastGenerateStyle: string
  setLastGenerateStyle: (style: string) => void
  sendMessage: (payload: AiQueryChatSendPayload) => Promise<void>
  refreshExplanationAt: (index: number, stylePrompt: string) => Promise<void>
  clearError: () => void
}

export type AiQueryChatProps = {
  chat: AiQueryChatController
  availableModels: OpenAiModelInfo[]
  selectedModel: string
  reasoningLevel: AiReasoningLevel
  modelsLoading?: boolean
  modelsError?: boolean
  onModelSelect?: (model: string) => void
  onReasoningLevelChange?: (level: AiReasoningLevel) => void
  schema?: string
  dialect?: string
  onApplySql?: (sql: string) => void
  /** Apply generated SQL to the editor and run it (e.g. main query runner). */
  onApplySqlAndRun?: (sql: string) => void
  /** When true, disables apply-and-run (e.g. no DB selected or run already in flight). */
  applySqlAndRunDisabled?: boolean
  className?: string
}

export function AiQueryChat({
  chat,
  availableModels,
  selectedModel,
  reasoningLevel,
  modelsLoading,
  modelsError,
  onModelSelect,
  onReasoningLevelChange,
  schema,
  dialect,
  onApplySql,
  onApplySqlAndRun,
  applySqlAndRunDisabled,
  className,
}: AiQueryChatProps) {
  const { t } = useTranslation()
  const {
    messages,
    isPending,
    error,
    lastGenerateStyle,
    setLastGenerateStyle,
    sendMessage,
    refreshExplanationAt,
    clearError,
  } = chat
  const [input, setInput] = useState("")
  const [modelFilter, setModelFilter] = useState("")
  const [modelSort, setModelSort] = useState<ModelSortKey>("id")
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const modelListScrollRef = useRef<HTMLDivElement>(null)
  const selectedModelItemRef = useRef<HTMLDivElement>(null)
  const selectedExplanationStyleKey = explainStyleKeyFromPrompt(lastGenerateStyle)
  const filteredModels = useMemo(() => {
    const q = modelFilter.trim().toLowerCase()
    const filtered = availableModels.filter((model) =>
      model.id.toLowerCase().includes(q),
    )
    if (modelSort === "id") return filtered
    const sorted = [...filtered]
    if (modelSort === "name") {
      sorted.sort((a, b) => a.id.localeCompare(b.id))
    } else {
      sorted.sort((a, b) =>
        compareModelsByPrice(a, b, modelSort === "priceAsc" ? "asc" : "desc"),
      )
    }
    return sorted
  }, [availableModels, modelFilter, modelSort])

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, isPending])

  const scrollSelectedModelIntoView = useCallback(() => {
    const container = modelListScrollRef.current
    if (!container) return false
    const item =
      selectedModelItemRef.current ??
      container.querySelector<HTMLElement>('[data-model-selected="true"]')
    if (!item) return false
    scrollElementIntoScrollParent(container, item)
    return true
  }, [])

  const handleModelMenuOpenChange = useCallback(
    (open: boolean) => {
      setModelMenuOpen(open)
      if (!open) return
      const run = () => scrollSelectedModelIntoView()
      requestAnimationFrame(() => {
        if (!run()) requestAnimationFrame(run)
      })
    },
    [scrollSelectedModelIntoView],
  )

  useEffect(() => {
    if (!modelMenuOpen || modelsLoading) return
    const run = () => scrollSelectedModelIntoView()
    const id = requestAnimationFrame(() => {
      if (!run()) requestAnimationFrame(run)
    })
    return () => cancelAnimationFrame(id)
  }, [
    modelMenuOpen,
    modelsLoading,
    filteredModels,
    selectedModel,
    scrollSelectedModelIntoView,
  ])

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(EXPLANATION_STYLE_STORAGE_KEY)?.trim() ?? ""
    if (!stored) return
    const valid = EXPLAIN_STYLE_ORDER.find((key) => key === stored)
    if (!valid) return
    setLastGenerateStyle(explainStylePrompt(valid))
  }, [setLastGenerateStyle])

  function handleSelectExplanationStyle(key: ExplainStyleKey) {
    const stylePrompt = explainStylePrompt(key)
    setLastGenerateStyle(stylePrompt)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(EXPLANATION_STYLE_STORAGE_KEY, key)
    }
  }

  async function handleCopySql(sql: string) {
    try {
      await navigator.clipboard.writeText(sql)
    } catch {
      // ignore
    }
  }

  function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || isPending) return
    clearError()
    void sendMessage({
      type: "generate",
      message: trimmed,
      style: lastGenerateStyle,
      schema,
      dialect,
    })
    setInput("")
  }

  const selectedReasoningLabel = t(
    `dataExplorer.aiChatMenuReasoningLevel${reasoningLevel[0].toUpperCase()}${reasoningLevel.slice(1)}`,
  )
  const selectedExplanationLabel = t(explainStyleLabelKey(selectedExplanationStyleKey))

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3 overflow-hidden", className)}>
      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden pr-1"
      >
        {messages.map((m: AiQueryChatMessage, index: number) => {
          if (m.role === "user") {
            if (m.variant === "fix") {
              return (
                <div
                  key={`${index}-user-fix`}
                  className={cn("space-y-2 text-sm text-foreground", index > 0 && "mt-6")}
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("dataExplorer.fixChatSqlLabel")}
                  </p>
                  <pre className="max-h-40 overflow-auto rounded-md border border-border/60 bg-muted/20 p-2 text-xs font-mono whitespace-pre-wrap">
                    {m.sql}
                  </pre>
                  <p className="pt-1 text-xs font-medium text-muted-foreground">
                    {t("dataExplorer.fixChatErrorLabel")}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{m.errorMessage}</p>
                </div>
              )
            }
            return (
              <p
                key={`${index}-user`}
                className={cn(
                  "whitespace-pre-wrap text-sm text-foreground",
                  index > 0 && "mt-6",
                )}
              >
                {m.content}
              </p>
            )
          }
          if (m.type === "sql") {
            return (
              <div
                key={`${index}-sql`}
                className="rounded-lg border border-border/70 bg-muted/30 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">SQL</p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                      disabled={isPending}
                      onClick={() => void handleCopySql(m.output)}
                      aria-label={t("dataExplorer.aiChatCopySql")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                      disabled={isPending || !onApplySql}
                      onClick={() => onApplySql?.(m.output)}
                      aria-label={t("dataExplorer.aiChatApplySql")}
                    >
                      <ClipboardPaste className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                      disabled={
                        isPending ||
                        !onApplySqlAndRun ||
                        Boolean(applySqlAndRunDisabled) ||
                        m.output.trim().length === 0
                      }
                      onClick={() => onApplySqlAndRun?.(m.output)}
                      aria-label={t("dataExplorer.aiChatApplySqlAndRun")}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <pre className="max-h-48 overflow-auto text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                  {m.output}
                </pre>
              </div>
            )
          }
          if (m.type === "fix") {
            return (
              <div
                key={`${index}-fix`}
                className={cn("space-y-3", index > 0 && "mt-6")}
              >
                <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                  <p className="mb-2 text-sm font-medium">
                    {t("dataExplorer.fixDiagnosisTitle")}
                  </p>
                  <div className="max-h-[280px] overflow-auto text-sm whitespace-pre-wrap text-muted-foreground">
                    {m.explanation}
                  </div>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {t("dataExplorer.aiChatFixedSql")}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                        disabled={isPending}
                        onClick={() => void handleCopySql(m.fixedSql)}
                        aria-label={t("dataExplorer.aiChatCopySql")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                        disabled={isPending || !onApplySql}
                        onClick={() => onApplySql?.(m.fixedSql)}
                        aria-label={t("dataExplorer.aiChatApplySql")}
                      >
                        <ClipboardPaste className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                        disabled={
                          isPending ||
                          !onApplySqlAndRun ||
                          Boolean(applySqlAndRunDisabled) ||
                          m.fixedSql.trim().length === 0
                        }
                        onClick={() => onApplySqlAndRun?.(m.fixedSql)}
                        aria-label={t("dataExplorer.aiChatApplySqlAndRun")}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <pre className="max-h-48 overflow-auto text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                    {m.fixedSql}
                  </pre>
                </div>
              </div>
            )
          }
          const styleKey = explainStyleKeyFromPrompt(m.style)
          const explanationChromeNone = styleKey === "none"
          const explanationMenuKeys = explanationChromeNone
            ? EXPLAIN_STYLE_ORDER.filter((k) => k !== "none")
            : EXPLAIN_STYLE_ORDER
          return (
            <div
              key={`${index}-explanation`}
              className={cn(
                explanationChromeNone
                  ? undefined
                  : "rounded-lg border border-border/70 bg-muted/30 p-3",
              )}
            >
              <div
                className={cn(
                  "flex flex-wrap items-center gap-2",
                  explanationChromeNone
                    ? "justify-end"
                    : "mb-2 justify-between",
                )}
              >
                {!explanationChromeNone ? (
                  <p className="text-sm font-medium">{t("dataExplorer.aiChatAnalysisTitle")}</p>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                      disabled={isPending}
                      aria-label={t("dataExplorer.aiChatExplanationStyleMenu")}
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {explanationMenuKeys.map((key) => (
                        <DropdownMenuItem
                          key={key}
                          className="gap-2"
                          disabled={isPending}
                          onSelect={() => {
                            const prompt = explainStylePrompt(key)
                            void refreshExplanationAt(index, prompt)
                          }}
                        >
                          <span className="flex-1">
                            {t(explainStyleLabelKey(key))}
                          </span>
                          {styleKey === key ? (
                            <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : null}
                        </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="max-h-[420px] overflow-auto text-sm whitespace-pre-wrap text-muted-foreground">
                {m.output}
              </div>
            </div>
          )
        })}
        {isPending ? (
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            aria-live="polite"
            aria-busy="true"
          >
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            <span>{t("dataExplorer.aiChatThinking")}</span>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="shrink-0 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="shrink-0 space-y-2 border-t border-border pt-3">
        <p className="text-sm font-medium">{t("dataExplorer.aiChatNewQuery")}</p>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey) return
            if (e.nativeEvent.isComposing) return
            e.preventDefault()
            handleSend()
          }}
          placeholder={t("dataExplorer.aiChatInputPlaceholder")}
          className="max-h-40 min-h-[88px] resize-y shadow-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          disabled={isPending}
          spellCheck
        />
        <div className="flex flex-col gap-1.5">
          <DropdownMenu open={modelMenuOpen} onOpenChange={handleModelMenuOpenChange}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "h-7 w-full gap-1 rounded-md border border-border/60 bg-muted/20 px-2 text-xs text-muted-foreground hover:bg-muted/35 hover:text-foreground",
                  aiChatMenuTriggerClass,
                )}
                aria-label={t("dataExplorer.aiChatMenuGroupModel")}
              >
                <span className="min-w-0 flex-1 truncate text-left text-foreground">{selectedModel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="flex w-72 max-h-[min(70vh,32rem)] flex-col overflow-hidden p-0"
            >
              <div className="flex shrink-0 items-center gap-1 border-b border-border p-1">
                <Input
                  value={modelFilter}
                  onChange={(event) => setModelFilter(event.target.value)}
                  onKeyDown={(event) => event.stopPropagation()}
                  placeholder={t("dataExplorer.aiChatMenuFilterModels")}
                  className="h-8 min-w-0 flex-1"
                />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-8 w-8 shrink-0 text-muted-foreground hover:bg-muted/50 hover:text-foreground data-[state=open]:bg-muted/50 data-[state=open]:text-foreground",
                        aiChatMenuTriggerClass,
                      )}
                      aria-label={t("dataExplorer.aiChatMenuSortLabel")}
                      title={t("dataExplorer.aiChatMenuSortLabel")}
                    >
                      <ArrowUpDown className="h-4 w-4" aria-hidden />
                    </Button>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {MODEL_SORT_OPTIONS.map((key) => (
                      <DropdownMenuItem
                        key={key}
                        className="gap-2"
                        onSelect={(event) => {
                          event.preventDefault()
                          setModelSort(key)
                        }}
                      >
                        <span className="flex-1">{t(modelSortLabelKey(key))}</span>
                        {modelSort === key ? (
                          <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </div>
              <div
                ref={modelListScrollRef}
                className="h-0 min-h-0 flex-1 overflow-y-auto p-1"
              >
              {modelsLoading ? (
                <DropdownMenuItem disabled>{t("dataExplorer.aiChatMenuModelsLoading")}</DropdownMenuItem>
              ) : null}
              {!modelsLoading && modelsError ? (
                <DropdownMenuItem disabled>{t("dataExplorer.aiChatMenuModelsFallback")}</DropdownMenuItem>
              ) : null}
              {!modelsLoading && availableModels.length === 0 ? (
                <DropdownMenuItem disabled>{t("dataExplorer.aiChatMenuModelsEmpty")}</DropdownMenuItem>
              ) : null}
              {!modelsLoading && availableModels.length > 0 && filteredModels.length === 0 ? (
                <DropdownMenuItem disabled>{t("dataExplorer.aiChatMenuModelsNotFound")}</DropdownMenuItem>
              ) : null}
              {!modelsLoading
                ? filteredModels.map((model) => {
                    const { id: modelId, pricing } = model
                    return (
                      <DropdownMenuItem
                        key={modelId}
                        ref={selectedModel === modelId ? selectedModelItemRef : undefined}
                        className="gap-2"
                        data-model-selected={
                          selectedModel === modelId ? "true" : undefined
                        }
                        onSelect={() => onModelSelect?.(modelId)}
                      >
                        <span className="min-w-0 flex-1 truncate">{modelId}</span>
                        <span className="group/price relative shrink-0">
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {pricingIndicator(pricing)}
                          </span>
                          <span className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden w-56 whitespace-pre-wrap rounded border border-border bg-popover p-2 text-[10px] leading-relaxed text-popover-foreground shadow-md group-hover/price:block">
                            {pricingHoverText(modelId, pricing)}
                          </span>
                        </span>
                        {selectedModel === modelId ? (
                          <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : null}
                      </DropdownMenuItem>
                    )
                  })
                : null}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex w-full gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "h-7 min-w-0 flex-1 basis-0 gap-1 rounded-md border border-border/60 bg-muted/20 px-2 text-xs text-muted-foreground hover:bg-muted/35 hover:text-foreground",
                  aiChatMenuTriggerClass,
                )}
                aria-label={t("dataExplorer.aiChatMenuGroupReasoning")}
              >
                <span className="shrink-0">{t("dataExplorer.aiChatMenuGroupReasoning")}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">{selectedReasoningLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {(["low", "medium", "high"] as const).map((level) => (
                <DropdownMenuItem
                  key={level}
                  className="gap-2"
                  onSelect={() => onReasoningLevelChange?.(level)}
                >
                  <span className="flex-1">
                    {t(`dataExplorer.aiChatMenuReasoningLevel${level[0].toUpperCase()}${level.slice(1)}`)}
                  </span>
                  {reasoningLevel === level ? (
                    <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "h-7 min-w-0 flex-1 basis-0 gap-1 rounded-md border border-border/60 bg-muted/20 px-2 text-xs text-muted-foreground hover:bg-muted/35 hover:text-foreground",
                  aiChatMenuTriggerClass,
                )}
                aria-label={t("dataExplorer.aiChatMenuGroupThird")}
              >
                <span className="shrink-0">{t("dataExplorer.aiChatMenuGroupThird")}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">{selectedExplanationLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {EXPLAIN_STYLE_ORDER.map((key) => (
                <DropdownMenuItem
                  key={key}
                  className="gap-2"
                  onSelect={() => handleSelectExplanationStyle(key)}
                >
                  <span className="flex-1">{t(explainStyleLabelKey(key))}</span>
                  {selectedExplanationStyleKey === key ? (
                    <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>
        {/* <div className="flex justify-end">
          <Button
            type="button"
            disabled={isPending || input.trim().length === 0}
            onClick={handleSend}
          >
            Send
          </Button>
        </div> */}
      </div>
    </div>
  )
}
