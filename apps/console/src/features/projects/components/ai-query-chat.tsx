import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowUp, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { type OpenAiModelInfo } from "../api"
import { AiQueryChatMessageList } from "./ai-query-chat-message-list"
import { AiQueryChatModelSelector } from "./ai-query-chat-model-selector"
import { type AiQueryChatMessage, type AiQueryChatSendPayload } from "../use-ai-query-chat"

export type AiQueryChatController = {
  messages: AiQueryChatMessage[]
  isPending: boolean
  sendMessage: (payload: AiQueryChatSendPayload) => Promise<void>
  stop: () => void
  reset: () => void
}

export type AiQueryChatProps = {
  chat: AiQueryChatController
  availableModels: OpenAiModelInfo[]
  selectedModel: string
  modelsLoading?: boolean
  modelsRefreshing?: boolean
  modelsError?: boolean
  onModelSelect?: (model: string) => void
  onRefreshModels?: () => void
  schema?: string
  dialect?: string
  onApplySql?: (sql: string) => void
  /** Apply generated SQL to the editor and run it (e.g. main query runner). */
  onApplySqlAndRun?: (sql: string) => void
  /** When true, disables apply-and-run (e.g. no DB selected or run already in flight). */
  applySqlAndRunDisabled?: boolean
  isQueryRunning?: boolean
  onPromptFocus?: () => void
  onRegisterPromptInserter?: (fn: ((text: string) => void) | null) => void
  inputDisabled?: boolean
  draftInput?: string
  onDraftInputChange?: (value: string) => void
  className?: string
}

export function AiQueryChat({
  chat,
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
  onPromptFocus,
  onRegisterPromptInserter,
  inputDisabled,
  draftInput,
  onDraftInputChange,
  className,
}: AiQueryChatProps) {
  const { t } = useTranslation()
  const {
    messages,
    isPending,
    sendMessage,
    stop,
  } = chat
  const isControlledDraft = draftInput !== undefined
  const [uncontrolledInput, setUncontrolledInput] = useState("")
  const input = isControlledDraft ? draftInput : uncontrolledInput
  const setInput = useCallback(
    (value: string) => {
      if (isControlledDraft) {
        onDraftInputChange?.(value)
        return
      }
      setUncontrolledInput(value)
    },
    [isControlledDraft, onDraftInputChange],
  )
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || isPending || inputDisabled) return
    void sendMessage({
      type: "generate",
      message: trimmed,
      schema,
      dialect,
    })
    setInput("")
  }

  const insertIntoPrompt = useCallback((text: string) => {
    if (!text) return
    const el = promptTextareaRef.current
    if (!el) {
      setInput(`${input}${text}`)
      return
    }

    const selectionStart = el.selectionStart ?? el.value.length
    const selectionEnd = el.selectionEnd ?? selectionStart

    const start = Math.min(selectionStart, input.length)
    const end = Math.min(selectionEnd, input.length)
    setInput(`${input.slice(0, start)}${text}${input.slice(end)}`)

    const nextCaret = selectionStart + text.length
    requestAnimationFrame(() => {
      const next = promptTextareaRef.current
      if (!next) return
      next.focus()
      next.setSelectionRange(nextCaret, nextCaret)
    })
  }, [input, setInput])

  useEffect(() => {
    onRegisterPromptInserter?.(insertIntoPrompt)
    return () => onRegisterPromptInserter?.(null)
  }, [insertIntoPrompt, onRegisterPromptInserter])

  const modelPricing = useMemo(
    () => availableModels.find((model) => model.id === selectedModel)?.pricing,
    [availableModels, selectedModel],
  )

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden", className)}>
      <AiQueryChatMessageList
        messages={messages}
        isPending={isPending}
        modelPricing={modelPricing}
        onApplySql={onApplySql}
        onApplySqlAndRun={onApplySqlAndRun}
        applySqlAndRunDisabled={applySqlAndRunDisabled}
        isQueryRunning={isQueryRunning}
      />

      <div className="w-full min-w-0 max-w-full shrink-0 space-y-2 pt-3">
        <div className="relative w-full min-w-0 max-w-full">
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
            className="max-h-60 min-h-[140px] w-full min-w-0 max-w-full resize-none pr-10 shadow-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 md:resize-y"
            disabled={isPending || inputDisabled}
            spellCheck
          />
          <Button
            type="button"
            size="icon"
            className="absolute bottom-2 right-2 h-6 w-6 rounded-full shadow-sm"
            disabled={!isPending && (input.trim().length === 0 || inputDisabled)}
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
        <div className="flex w-full min-w-0 max-w-full flex-col gap-1.5">
          <AiQueryChatModelSelector
            availableModels={availableModels}
            selectedModel={selectedModel}
            modelsLoading={modelsLoading}
            modelsRefreshing={modelsRefreshing}
            modelsError={modelsError}
            onModelSelect={onModelSelect}
            onRefreshModels={onRefreshModels}
          />
        </div>
      </div>
    </div>
  )
}
