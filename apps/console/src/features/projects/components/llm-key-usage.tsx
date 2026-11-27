import { useTranslation } from "react-i18next"
import { Copy } from "lucide-react"
import { Button, useToast } from "@sb0rka/ui"
import { chatCompletionsCurl, shellQuote } from "../models-utils"

const llmKeyEnv = "SB0RKA_LLM_KEY"

export const maskedLlmKeyExport = `export ${llmKeyEnv}='********************'`

export function llmKeyExportCommand(value: string) {
  return `export ${llmKeyEnv}=${shellQuote(value)}`
}

export function CommandBlock({
  text,
  label,
  dir,
  getText,
}: {
  text: string
  label: string
  dir?: "ltr"
  getText?: () => string | Promise<string>
}) {
  const { t } = useTranslation()
  const { showSuccess, showError } = useToast()

  async function copy() {
    try {
      await navigator.clipboard.writeText(await (getText?.() ?? text))
      showSuccess(t("common.messages.copied"))
    } catch {
      showError(t("common.messages.copyFailed"))
    }
  }

  return (
    <div className="flex rounded-md bg-muted">
      <pre className="min-w-0 flex-1 overflow-x-auto p-3 text-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" dir={dir}>
        <code>{text}</code>
      </pre>
      <div className="shrink-0 bg-muted p-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 bg-muted"
          aria-label={label}
          title={label}
          onClick={() => void copy()}
        >
          <Copy className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

export function GatewayUrlField({
  baseUrl,
  pending,
  failed,
  onRetry,
}: {
  baseUrl?: string
  pending: boolean
  failed: boolean
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const { showSuccess, showError } = useToast()

  async function copyUrl() {
    if (!baseUrl) return
    try {
      await navigator.clipboard.writeText(baseUrl)
      showSuccess(t("common.messages.copied"))
    } catch {
      showError(t("common.messages.copyFailed"))
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="flex h-6 items-center font-semibold">{t("models.dialog.baseUrl")}</h3>
      {baseUrl ? (
        <div className="flex items-center gap-1 rounded-md border border-input px-2 py-1">
          <code className="min-w-0 flex-1 break-all px-1 text-sm">{baseUrl}</code>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={t("models.dialog.copyUrl")}
            onClick={() => void copyUrl()}
          >
            <Copy className="size-4" aria-hidden />
          </Button>
        </div>
      ) : pending ? (
        <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : failed ? (
        <div className="space-y-2" role="alert">
          <p className="text-sm text-destructive">{t("models.dialog.gatewayUnavailable")}</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            {t("models.retry")}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function LlmKeyQuickstart({
  baseUrl,
  pending,
  failed,
  onRetry,
  modelSlug,
  prompt,
  resolveApiKey,
}: {
  baseUrl?: string
  pending: boolean
  failed: boolean
  onRetry: () => void
  modelSlug?: string
  prompt: string
  resolveApiKey: () => Promise<string>
}) {
  const { t } = useTranslation()
  const command = baseUrl && modelSlug
    ? chatCompletionsCurl(baseUrl, modelSlug, prompt)
    : null

  return (
    <div className="min-w-0 space-y-3">
      <h3 className="font-semibold">{t("quickStart.terminal")}</h3>
      <CommandBlock
        text={maskedLlmKeyExport}
        label={t("quickStart.copyExport")}
        getText={async () => llmKeyExportCommand(await resolveApiKey())}
      />
      {command ? (
        <CommandBlock text={command} label={t("quickStart.copyCurl")} dir="ltr" />
      ) : pending ? (
        <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <div className="space-y-2" role="alert">
          <p className="text-sm text-destructive">
            {t(baseUrl ? "quickStart.noExampleModel" : "models.dialog.gatewayUnavailable")}
          </p>
          {!baseUrl && failed ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t("models.retry")}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}
