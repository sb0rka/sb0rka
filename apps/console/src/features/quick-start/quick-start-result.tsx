import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { ArrowUpRight, Copy, Eye, EyeOff, KeyRound } from "lucide-react"
import { Button, cn, useToast } from "@sb0rka/ui"
import { activeModelsQuery, getGateway, getSecretModels, revealSecretValue, type LLMModel } from "@/features/projects/api"
import { useSecret } from "@/features/projects/hooks"
import { CorporateBillingContact, TopUpButton } from "@/features/subscription/components/billing-actions"
import { ApiError } from "@/lib/api-client"
import { saveProgress } from "./progress"

function CommandBlock({ text, label, dir, getText }: {
  text: string
  label: string
  dir?: "ltr"
  getText?: () => string | Promise<string>
}) {
  return (
    <div className="flex rounded-md bg-muted">
      <pre className="min-w-0 flex-1 overflow-x-auto p-3 text-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" dir={dir}>
        <code>{text}</code>
      </pre>
      <div className="shrink-0 bg-muted p-1.5">
        <CopyButton label={label} getText={getText ?? (() => text)} className="bg-muted" />
      </div>
    </div>
  )
}

function CopyButton({ label, getText, className }: { label: string; getText: () => string | Promise<string>; className?: string }) {
  const { t } = useTranslation()
  const { showSuccess, showError } = useToast()
  async function copy() {
    try {
      await navigator.clipboard.writeText(await getText())
      showSuccess(t("common.messages.copied"))
    } catch {
      showError(t("common.messages.copyFailed"))
    }
  }
  return (
    <Button type="button" variant="ghost" size="icon" className={cn("size-8 shrink-0", className)} aria-label={label} title={label} onClick={copy}>
      <Copy className="size-4" aria-hidden />
    </Button>
  )
}

function useSecretReveal(projectId: string, secretId: string, autoReveal: boolean) {
  const [visibility, setVisibility] = useState<boolean | null>(null)
  const show = visibility ?? autoReveal
  const [value, setValue] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!show) return
    let current = true
    revealSecretValue(projectId, secretId).then(
      result => { if (current) setValue(result.value) },
      () => { if (current) { setFailed(true); setVisibility(false) } },
    )
    return () => { current = false }
  }, [projectId, secretId, show])
  function toggle() {
    setFailed(false)
    setValue(null)
    setVisibility(!show)
  }
  return { show, value, failed, toggle }
}

function SecretField({ projectId, secretId, reveal }: {
  projectId: string
  secretId: string
  reveal: ReturnType<typeof useSecretReveal>
}) {
  const { t } = useTranslation()
  const { data: secret } = useSecret(projectId, secretId)
  const { show, value, failed, toggle } = reveal
  const toggleLabel = t(show ? "common.actions.hide" : "common.actions.show")
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold">
        <KeyRound className="size-4 shrink-0" aria-hidden />
        {t("quickStart.apiKeySecret")}
      </h3>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {secret && <p className="min-w-0 break-all font-mono text-sm">{secret.name}</p>}
        <Link className="ml-auto inline-flex shrink-0 items-center gap-1 text-sm underline-offset-4 hover:underline"
          to={`/projects/${projectId}?tab=secrets&secret=${encodeURIComponent(secretId)}`}>
          {t("quickStart.openSecret")}<ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <div className="flex min-w-0 items-center gap-1 rounded-md border border-input px-2 py-1">
        <input type="text" readOnly aria-label={t("secrets.key")} autoComplete="off" spellCheck={false}
          value={show ? value ?? t("common.loading") : "••••••••••••••••"}
          className="h-8 min-w-0 flex-1 cursor-text border-0 bg-transparent px-1 font-mono text-sm outline-none" />
        <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label={toggleLabel} title={toggleLabel}
          onClick={toggle}>
          {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </Button>
        <CopyButton label={t("secrets.copySecret")} getText={async () => value ?? (await revealSecretValue(projectId, secretId)).value} />
      </div>
      {failed && <p role="alert" className="text-sm text-destructive">{t("secrets.revealError")}</p>}
    </section>
  )
}

const exampleSlug = "ministral-8b-2512"

function exampleModel(active: LLMModel[], allowed: LLMModel[]) {
  const ids = new Set(allowed.map(model => model.id))
  const models = active.filter(model => model.slug && ids.has(model.id))
  const preferred = models.find(model => model.slug === exampleSlug)
  const textModel = models.find(model => {
    const modalities = model.specifications?.modalities
    return modalities?.input?.includes("text") && modalities.output?.includes("text")
  })
  // Older catalog entries do not declare modalities.
  return preferred ?? textModel ?? models.find(model => {
    const modalities = model.specifications?.modalities
    return !modalities?.input?.length && !modalities?.output?.length
  })
}

const llmKeyEnv = "SB0RKA_LLM_KEY"
const maskedExport = `export ${llmKeyEnv}='********************'`

function shellQuote(value: string) {
  return "'" + value.replaceAll("'", "'\\''") + "'"
}

function exportCommand(value: string) {
  return `export ${llmKeyEnv}=${shellQuote(value)}`
}

function chatCommand(baseUrl: string, slug: string, message: string) {
  const payload = JSON.stringify({ model: slug, messages: [{ role: "user", content: message }] }, null, 2)
  return [
    "curl " + shellQuote(baseUrl.replace(/\/+$/, "") + "/chat/completions"),
    `  -H "Authorization: Bearer $${llmKeyEnv}"`,
    '  -H "Content-Type: application/json"',
    "  -d " + shellQuote(payload),
  ].join(" \\\n")
}

export function QuickStartResult({ userId, projectId, secretId, autoReveal }: {
  userId: string; projectId: string; secretId: string; autoReveal: boolean
}) {
  const { t } = useTranslation()
  const reveal = useSecretReveal(projectId, secretId, autoReveal)
  const gateway = useQuery({ queryKey: ["llm", "gateway"], queryFn: getGateway, retry: false })
  const catalog = useQuery(activeModelsQuery)
  const bound = useQuery({
    queryKey: ["projects", projectId, "secrets", secretId, "models"],
    queryFn: () => getSecretModels(projectId, secretId), staleTime: 0, retry: false,
  })
  const model = exampleModel(catalog.data?.models ?? [], bound.data?.models ?? [])
  const baseUrl = gateway.data?.base_url
  const command = baseUrl && model ? chatCommand(baseUrl, model.slug, t("quickStart.prompt")) : null
  const pending = gateway.isPending || catalog.isPending || bound.isPending

  if (bound.error instanceof ApiError && bound.error.status === 404) {
    return <div className="space-y-3" role="alert">
      <p className="text-sm text-destructive">{t("quickStart.secretUnavailable")}</p>
      <Button variant="outline" onClick={() => saveProgress(userId, { stage: "key", projectId })}>{t("secrets.create")}</Button>
    </div>
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
      <div className="min-w-0 space-y-6">
        <SecretField projectId={projectId} secretId={secretId} reveal={reveal} />
        <section className="space-y-3">
          <p className="text-sm font-medium">Base URL</p>
          {baseUrl ? <div className="flex items-center gap-1 rounded-md border border-input px-2 py-1">
            <code className="min-w-0 flex-1 break-all px-1 text-sm">{baseUrl}</code>
            <CopyButton label={t("quickStart.copyUrl")} getText={() => baseUrl} />
          </div> : <p className="text-sm text-muted-foreground">{t(gateway.isPending ? "common.loading" : "quickStart.gatewayUnavailable")}</p>}
        </section>
        <section className="space-y-3 pt-2">
          <h3 className="font-semibold">{t("nav.subscription")}</h3>
          <p className="text-sm">{t("quickStart.billing")}</p>
          <TopUpButton label={t("quickStart.topUp")} />
          <CorporateBillingContact />
        </section>
      </div>
      <div className="min-w-0 space-y-6">
        <section className="space-y-3">
          <h3 className="font-semibold">{t("quickStart.terminal")}</h3>
          <p className="text-sm text-muted-foreground">{t("quickStart.setEnv")}</p>
          <CommandBlock text={reveal.show && reveal.value ? exportCommand(reveal.value) : maskedExport} label={t("quickStart.copyExport")}
            getText={async () => exportCommand(reveal.value ?? (await revealSecretValue(projectId, secretId)).value)} />
          {command ? <>
            <p className="text-sm text-muted-foreground">{t("quickStart.runCurl")}</p>
            <CommandBlock text={command} label={t("quickStart.copyCurl")} dir="ltr" />
            <p className="break-words text-sm text-muted-foreground">{t("quickStart.response")} <code className="text-foreground">choices[0].message.content</code></p>
          </> : pending ? <p role="status" className="text-sm">{t("common.loading")}</p> : <div className="space-y-2" role="alert">
            <p className="text-sm text-destructive">{t(baseUrl ? "quickStart.noExampleModel" : "quickStart.exampleUnavailable")}</p>
            <Button variant="outline" size="sm" onClick={() => { void gateway.refetch(); void catalog.refetch(); void bound.refetch() }}>{t("subscription.retry")}</Button>
          </div>}
        </section>
      </div>
    </div>
  )
}
