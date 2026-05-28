import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowUp, Check, ChevronDown, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  EXPLAIN_STYLE_ORDER,
  explainStyleKeyFromPrompt,
  explainStyleLabelKey,
  explainStylePrompt,
  type ExplainStyleKey,
} from "../explain-styles"
import { type OpenAiModelInfo } from "../api"
import { AiQueryChatMessageList } from "./ai-query-chat-message-list"
import { AiQueryChatModelSelector } from "./ai-query-chat-model-selector"
import {
  type AiQueryChatMessage,
  type AiQueryChatSendPayload,
  type AiReasoningLevel,
} from "../use-ai-query-chat"

const EXPLANATION_STYLE_STORAGE_KEY = "ai-query-chat:explanation-style"

const aiChatMenuTriggerClass =
  "focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"

export type AiQueryChatController = {
  messages: AiQueryChatMessage[]
  isPending: boolean
  lastGenerateStyle: string
  setLastGenerateStyle: (style: string) => void
  sendMessage: (payload: AiQueryChatSendPayload) => Promise<void>
  refreshExplanationAt: (index: number, stylePrompt: string) => Promise<void>
  stop: () => void
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
  onPromptFocus?: () => void
  onRegisterPromptInserter?: (fn: ((text: string) => void) | null) => void
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
  onPromptFocus,
  onRegisterPromptInserter,
  className,
}: AiQueryChatProps) {
  const { t } = useTranslation()
  const {
    messages,
    isPending,
    lastGenerateStyle,
    setLastGenerateStyle,
    sendMessage,
    refreshExplanationAt,
    stop,
  } = chat
  const [input, setInput] = useState("")
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const selectedExplanationStyleKey = explainStyleKeyFromPrompt(lastGenerateStyle)

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

  function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || isPending) return
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

  const insertIntoPrompt = useCallback((text: string) => {
    if (!text) return
    const el = promptTextareaRef.current
    if (!el) {
      setInput((prev) => `${prev}${text}`)
      return
    }

    const selectionStart = el.selectionStart ?? el.value.length
    const selectionEnd = el.selectionEnd ?? selectionStart

    setInput((prev) => {
      const start = Math.min(selectionStart, prev.length)
      const end = Math.min(selectionEnd, prev.length)
      return `${prev.slice(0, start)}${text}${prev.slice(end)}`
    })

    const nextCaret = selectionStart + text.length
    requestAnimationFrame(() => {
      const next = promptTextareaRef.current
      if (!next) return
      next.focus()
      next.setSelectionRange(nextCaret, nextCaret)
    })
  }, [])

  useEffect(() => {
    onRegisterPromptInserter?.(insertIntoPrompt)
    return () => onRegisterPromptInserter?.(null)
  }, [insertIntoPrompt, onRegisterPromptInserter])

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3 overflow-hidden", className)}>
      <AiQueryChatMessageList
        messages={messages}
        isPending={isPending}
        onApplySql={onApplySql}
        onApplySqlAndRun={onApplySqlAndRun}
        applySqlAndRunDisabled={applySqlAndRunDisabled}
        onRefreshExplanationAt={refreshExplanationAt}
      />

      <div className="shrink-0 space-y-2 pt-3">
        <div className="relative">
          <Textarea
            ref={promptTextareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => onPromptFocus?.()}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey) return
              if (e.nativeEvent.isComposing) return
              e.preventDefault()
              handleSend()
            }}
            placeholder={t("dataExplorer.aiChatInputPlaceholder")}
            className="max-h-60 min-h-[140px] resize-y pr-10 shadow-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            disabled={isPending}
            spellCheck
          />
          <Button
            type="button"
            size="icon"
            className="absolute bottom-2 right-2 h-6 w-6 rounded-full shadow-sm"
            disabled={!isPending && input.trim().length === 0}
            onClick={() => {
              if (isPending) {
                stop()
                return
              }
              handleSend()
            }}
            aria-label={isPending ? t("dataExplorer.aiChatStop") : t("dataExplorer.aiChatSend")}
          >
            {isPending ? (
              <Square className="h-3 w-3 fill-current" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5" strokeWidth={3} />
            )}
          </Button>
        </div>
        <div className="flex flex-col gap-1.5">
          <AiQueryChatModelSelector
            availableModels={availableModels}
            selectedModel={selectedModel}
            modelsLoading={modelsLoading}
            modelsError={modelsError}
            onModelSelect={onModelSelect}
          />

          <div className="flex w-full flex-wrap gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "h-11 min-w-[9.5rem] flex-1 gap-1 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/35 hover:text-foreground",
                    aiChatMenuTriggerClass,
                  )}
                  aria-label={t("dataExplorer.aiChatMenuGroupReasoning")}
                >
                  <span className="min-w-0 flex-1 text-left leading-none">
                    <span className="block truncate text-[10px] leading-3">
                      {t("dataExplorer.aiChatMenuGroupReasoning")}
                    </span>
                    <span className="mt-1 block truncate text-xs leading-4 text-foreground">
                      {selectedReasoningLabel}
                    </span>
                  </span>
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
                      {t(
                        `dataExplorer.aiChatMenuReasoningLevel${level[0].toUpperCase()}${level.slice(1)}`,
                      )}
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
                    "h-11 min-w-[9.5rem] flex-1 gap-1 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/35 hover:text-foreground",
                    aiChatMenuTriggerClass,
                  )}
                  aria-label={t("dataExplorer.aiChatMenuGroupThird")}
                >
                  <span className="min-w-0 flex-1 text-left leading-none">
                    <span className="block truncate text-[10px] leading-3">
                      {t("dataExplorer.aiChatMenuGroupThird")}
                    </span>
                    <span className="mt-1 block truncate text-xs leading-4 text-foreground">
                      {selectedExplanationLabel}
                    </span>
                  </span>
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
      </div>
    </div>
  )
}
