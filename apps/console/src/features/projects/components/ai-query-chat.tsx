import { useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, ClipboardPaste, Copy, Loader2, Play, Sparkles } from "lucide-react"
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
  explainStylePrompt,
  type ExplainStyleKey,
} from "../explain-styles"
import { type AiQueryChatMessage, type AiQueryChatSendPayload } from "../use-ai-query-chat"

function explainStyleLabelEnglish(key: ExplainStyleKey): string {
  switch (key) {
    case "none":
      return "none"
    case "short":
      return "short"
    case "breakdown":
      return "breakdown"
    case "haiku":
      return "haiku"
    case "homer":
      return "Homer"
    case "russianBylina":
      return "Русская былина"
    default: {
      const _x: never = key
      return _x
    }
  }
}

export type AiQueryChatController = {
  messages: AiQueryChatMessage[]
  isPending: boolean
  error: string | null
  lastGenerateStyle: string
  sendMessage: (payload: AiQueryChatSendPayload) => Promise<void>
  refreshExplanationAt: (index: number, stylePrompt: string) => Promise<void>
  clearError: () => void
}

export type AiQueryChatProps = {
  chat: AiQueryChatController
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
    sendMessage,
    refreshExplanationAt,
    clearError,
  } = chat
  const [input, setInput] = useState("")
  const listRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, isPending])

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

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3 overflow-hidden", className)}>
      <div
        ref={listRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden pr-1"
      >
        {messages.map((m: AiQueryChatMessage, index: number) => {
          if (m.role === "user") {
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
                  <p className="text-sm font-medium">Analysis</p>
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
                            {explainStyleLabelEnglish(key)}
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
            <span>Thinking…</span>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="shrink-0 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="shrink-0 space-y-2 border-t border-border pt-3">
        <p className="text-sm font-medium">New Query</p>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey) return
            if (e.nativeEvent.isComposing) return
            e.preventDefault()
            handleSend()
          }}
          placeholder="Ask in natural language…"
          className="max-h-40 min-h-[88px] resize-y shadow-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          disabled={isPending}
          spellCheck
        />
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
