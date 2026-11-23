import { useEffect, useRef, useState, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Check, ChevronDown, Loader2, Send } from "lucide-react"
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
} from "@sb0rka/ui"
import {
  sendLlmTestMessage,
  type LLMModel,
  type LlmTestMessageResponse,
} from "../api"
import { modelDisplayName } from "../models-utils"

interface LlmKeyTestPanelProps {
  baseUrl?: string
  models: LLMModel[]
  selectedModel: LLMModel
  onSelectModel: (modelId: string) => void
  resolveApiKey: () => Promise<string>
}

interface TestResult {
  modelLabel: string
  response: LlmTestMessageResponse
}

export function LlmKeyTestPanel({
  baseUrl,
  models,
  selectedModel,
  onSelectModel,
  resolveApiKey,
}: LlmKeyTestPanelProps) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState(() => t("models.dialog.testDefaultPrompt"))
  const abortRef = useRef<AbortController | null>(null)

  const mutation = useMutation<TestResult, Error, { model: LLMModel; message: string }>({
    retry: false,
    mutationFn: async ({ model, message }) => {
      if (!baseUrl) {
        throw new Error(t("models.dialog.gatewayUnavailable"))
      }
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const apiKey = await resolveApiKey()
      if (controller.signal.aborted) {
        throw new DOMException("Aborted", "AbortError")
      }
      const response = await sendLlmTestMessage({
        baseUrl,
        apiKey,
        model: model.slug,
        message,
        signal: controller.signal,
      })
      return {
        modelLabel: modelDisplayName(model),
        response,
      }
    },
  })

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const trimmedPrompt = prompt.trim()
  const canSend = Boolean(baseUrl) && trimmedPrompt.length > 0 && !mutation.isPending
  const isAbortedError = mutation.isError && mutation.error.name === "AbortError"

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSend) return
    mutation.mutate({ model: selectedModel, message: trimmedPrompt })
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-muted/20 p-3.5">
      <div className="space-y-0.5">
        <p className="flex min-w-0 items-baseline gap-1.5 text-sm">
          <span className="shrink-0 font-medium">{t("models.dialog.testTitle")}</span>
          {models.length === 1 ? (
            <span className="min-w-0 truncate text-muted-foreground">{modelDisplayName(selectedModel)}</span>
          ) : null}
        </p>
        {models.length > 1 ? (
          <p className="text-xs text-muted-foreground">{t("models.dialog.testDescription")}</p>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} autoComplete="off" className="space-y-2.5">
        {models.length > 1 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t("models.dialog.testModel")}</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div
                  tabIndex={0}
                  aria-label={t("models.dialog.testModel")}
                  className={cn(
                    "flex h-9 w-full cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm outline-none hover:bg-muted/40 focus-visible:ring-1 focus-visible:ring-ring",
                    mutation.isPending && "pointer-events-none opacity-60",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {modelDisplayName(selectedModel)}
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-60 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
              >
                {models.map((model) => {
                  const isSelected = model.id === selectedModel.id
                  return (
                    <DropdownMenuItem
                      key={model.id}
                      className={cn("gap-2", isSelected && "bg-accent font-medium text-accent-foreground")}
                      onSelect={() => onSelectModel(model.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{modelDisplayName(model)}</p>
                      </div>
                      {isSelected ? <Check className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}

        <div className="space-y-1">
          <Label htmlFor="llm-key-test-prompt" className="sr-only">
            {t("models.dialog.testPromptLabel")}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="llm-key-test-prompt"
              value={prompt}
              disabled={mutation.isPending || !baseUrl}
              placeholder={t("models.dialog.testPromptPlaceholder")}
              className="h-9 min-w-0 flex-1 bg-background"
              onChange={(event) => setPrompt(event.target.value)}
            />
            <Button type="submit" size="sm" className="h-9 shrink-0" disabled={!canSend}>
              {mutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="mr-2 size-3.5" aria-hidden />
              )}
              {mutation.isPending ? t("models.dialog.testSending") : t("models.dialog.testSend")}
            </Button>
          </div>
        </div>
      </form>

      {mutation.isSuccess ? (
        <div className="space-y-1.5 rounded-md border border-border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {t("models.dialog.testReplyLabel")} · {mutation.data.modelLabel}
            </span>
            <span className="tabular-nums">
              {t("models.dialog.testLatency", { ms: mutation.data.response.latencyMs })}
              {mutation.data.response.usage?.totalTokens
                ? ` · ${t("models.dialog.testTokens", { count: mutation.data.response.usage.totalTokens })}`
                : ""}
            </span>
          </div>
          <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {mutation.data.response.text}
          </p>
        </div>
      ) : null}

      {mutation.isError && !isAbortedError ? (
        <p role="alert" className="break-words text-sm text-destructive">
          {mutation.error.message || t("models.dialog.testError")}
        </p>
      ) : null}
    </div>
  )
}
