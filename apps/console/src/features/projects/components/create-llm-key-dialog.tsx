import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ArrowUpRight, Copy, Eye, EyeOff, KeyRound, Loader2, X } from "lucide-react"
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  useToast,
} from "@sb0rka/ui"
import { getGateway, revealSecretValue, type LLMModel } from "../api"
import { modelDisplayName } from "../models-utils"
import { GatewayUrlField, LlmKeyQuickstart } from "./llm-key-usage"
import { suggestLlmKeyName, useCreateLlmKey } from "../use-create-llm-key"
import { TopUpButton } from "@/features/subscription/components/billing-actions"
import { useAccountBalance } from "@/features/subscription/hooks"
import {
  accountBalanceEntries,
  displayCurrency,
  formatMoneyWithSign,
} from "@/features/subscription/quota-format"
import { LlmKeyTestPanel } from "./llm-key-test-panel"

function KeyReadyBalance() {
  const { t, i18n } = useTranslation()
  const balance = useAccountBalance()
  const figures = accountBalanceEntries(balance.data).map((entry) => {
    const currency = displayCurrency(entry.balance.available, i18n.language)
    return {
      code: entry.code,
      text: formatMoneyWithSign(entry.balance.available, currency) ?? "—",
    }
  })

  return (
    <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-x-2 gap-y-1 text-sm leading-none">
      <span className="text-muted-foreground">{t("subscription.balanceTitle")}</span>
      {balance.isPending ? (
        <span aria-busy="true" className="inline-block h-3.5 w-12 animate-pulse rounded bg-muted" />
      ) : balance.isError ? (
        <Button
          type="button"
          variant="link"
          className="h-auto px-0 text-sm font-normal text-destructive"
          onClick={() => void balance.refetch()}
        >
          {t("subscription.retry")}
        </Button>
      ) : figures.length > 1 ? (
        <span className="inline-flex flex-wrap items-baseline justify-end gap-x-2">
          {figures.map((figure) => (
            <span key={figure.code} className="inline-flex items-baseline gap-1">
              <span className="font-mono text-xs text-muted-foreground">{figure.code}</span>
              <span className="font-medium tabular-nums">{figure.text}</span>
            </span>
          ))}
        </span>
      ) : (
        <span className="font-medium tabular-nums">{figures[0]?.text ?? "—"}</span>
      )}
      <TopUpButton
        label={t("subscription.topUp")}
        variant="link"
        className="h-auto px-0 text-sm font-normal text-muted-foreground hover:text-foreground"
      />
    </div>
  )
}

interface CreateLlmKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  models: LLMModel[]
  onRemoveModel: (id: string) => void
  onDone?: (secretId: string) => void
}

export function CreateLlmKeyDialog({
  open,
  onOpenChange,
  projectId,
  models,
  onRemoveModel,
  onDone,
}: CreateLlmKeyDialogProps) {
  const { t } = useTranslation()
  const { showSuccess, showError } = useToast()
  const issuedModels = useRef<LLMModel[]>([])
  const cachedSecretRef = useRef<string | null>(null)
  const wasOpen = useRef(open)
  const [name, setName] = useState(suggestLlmKeyName)
  const [description, setDescription] = useState("")
  const [visible, setVisible] = useState(false)
  const [secretValue, setSecretValue] = useState<string | null>(null)
  const [revealFailed, setRevealFailed] = useState(false)
  const [selectedTestModelId, setSelectedTestModelId] = useState<string | null>(null)
  const { mutation, step, create, reset } = useCreateLlmKey({ projectId })
  const ready = mutation.isSuccess && typeof mutation.data === "string"
  const secretId = ready ? mutation.data : null
  const gateway = useQuery({
    queryKey: ["llm", "gateway"],
    queryFn: getGateway,
    enabled: ready,
    retry: false,
  })
  const requestState = useRef({ pending: false, success: false })
  requestState.current = { pending: mutation.isPending, success: mutation.isSuccess }

  useEffect(() => {
    if (!open) {
      wasOpen.current = false
      return
    }
    if (wasOpen.current) return
    wasOpen.current = true
    // A new name belongs to a new dialog open. Pending/success must keep the name already submitted.
    if (requestState.current.pending || requestState.current.success) return
    issuedModels.current = []
    cachedSecretRef.current = null
    setName(suggestLlmKeyName())
    setDescription("")
    setVisible(false)
    setSecretValue(null)
    setRevealFailed(false)
    setSelectedTestModelId(null)
  }, [open])

  function clearSecret() {
    cachedSecretRef.current = null
    setVisible(false)
    setSecretValue(null)
    setRevealFailed(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next && !mutation.isPending) {
      clearSecret()
      issuedModels.current = []
      setSelectedTestModelId(null)
      reset()
    }
    onOpenChange(next)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const requested = name.trim()
    if (!requested || models.length === 0 || mutation.isPending || mutation.isSuccess) return
    issuedModels.current = models
    setSelectedTestModelId(null)
    create({
      name: requested,
      description: description.trim() || undefined,
      modelIds: models.map((model) => model.id),
    })
  }

  const boundModels = issuedModels.current.length > 0 ? issuedModels.current : models
  const testableModels = boundModels.filter((model) => Boolean(model.slug))
  const activeModel =
    testableModels.find((model) => model.id === selectedTestModelId) ?? testableModels[0]
  const baseUrl = gateway.data?.base_url
  const keyHref = secretId
    ? `/projects/${projectId}?tab=models&key=${encodeURIComponent(secretId)}`
    : `/projects/${projectId}?tab=models`

  function finish() {
    if (secretId) onDone?.(secretId)
    handleOpenChange(false)
  }

  async function resolveApiKey(): Promise<string> {
    if (!secretId) throw new Error(t("models.keys.revealError"))
    const cached = secretValue ?? cachedSecretRef.current
    if (cached) return cached
    let revealed: { value: string }
    try {
      revealed = await revealSecretValue(projectId, secretId)
    } catch {
      throw new Error(t("models.keys.revealError"))
    }
    if (!revealed.value) throw new Error(t("models.keys.revealError"))
    cachedSecretRef.current = revealed.value
    return revealed.value
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      showSuccess(t("common.messages.copied"))
    } catch {
      showError(t("common.messages.copyFailed"))
    }
  }

  async function toggleSecret() {
    if (!secretId) return
    if (visible) {
      clearSecret()
      return
    }
    try {
      const revealed = await revealSecretValue(projectId, secretId)
      if (!revealed.value) return
      cachedSecretRef.current = revealed.value
      setSecretValue(revealed.value)
      setVisible(true)
      setRevealFailed(false)
    } catch {
      setRevealFailed(true)
    }
  }

  async function copySecret() {
    if (!secretId) return
    let value = (visible ? secretValue : null) ?? cachedSecretRef.current
    if (!value) {
      try {
        value = (await revealSecretValue(projectId, secretId)).value
        if (value) cachedSecretRef.current = value
      } catch {
        showError(t("models.keys.revealError"))
        return
      }
    }
    if (!value) return
    await copyText(value)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden",
          ready && secretId ? "max-w-4xl" : "max-w-2xl",
        )}
      >
        {ready && secretId ? (
          <>
            <DialogHeader className="shrink-0 pr-12 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <DialogTitle className="min-w-0">{t("models.dialog.readyTitle")}</DialogTitle>
                <KeyReadyBalance />
              </div>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              <div className="grid gap-8 md:grid-cols-2 md:items-start md:gap-10">
                <div className="min-w-0 space-y-6">
                  <section className="space-y-3">
                    <h3 className="flex items-center gap-2 font-semibold">
                      <KeyRound className="size-4 shrink-0" aria-hidden />
                      {t("models.dialog.apiKey")}
                    </h3>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      {name.trim() ? (
                        <p className="min-w-0 break-all font-mono text-sm">{name.trim()}</p>
                      ) : null}
                      <Link
                        className="ml-auto inline-flex shrink-0 items-center gap-1 text-sm underline-offset-4 hover:underline"
                        to={keyHref}
                        onClick={(event) => {
                          if (
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.altKey ||
                            event.button !== 0
                          ) {
                            return
                          }
                          event.preventDefault()
                          if (secretId) onDone?.(secretId)
                        }}
                      >
                        {t("models.dialog.openKey")}
                        <ArrowUpRight className="size-3.5" aria-hidden />
                      </Link>
                    </div>
                    <div className="flex min-w-0 items-center gap-1 rounded-md border border-input px-2 py-1">
                      <input
                        id="llm-key-value"
                        type="text"
                        readOnly
                        value={visible ? secretValue ?? "" : "••••••••••••••••"}
                        aria-label={t("models.dialog.apiKey")}
                        autoComplete="off"
                        spellCheck={false}
                        className="h-8 min-w-0 flex-1 cursor-text border-0 bg-transparent px-1 font-mono text-sm outline-none"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        aria-label={t(visible ? "common.actions.hide" : "common.actions.show")}
                        title={t(visible ? "common.actions.hide" : "common.actions.show")}
                        onClick={() => void toggleSecret()}
                      >
                        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        aria-label={t("models.dialog.copyKey")}
                        title={t("models.dialog.copyKey")}
                        onClick={() => void copySecret()}
                      >
                        <Copy className="size-4" aria-hidden />
                      </Button>
                    </div>
                    {revealFailed ? (
                      <p role="alert" className="text-sm text-destructive">{t("models.keys.revealError")}</p>
                    ) : null}
                  </section>
                  <GatewayUrlField
                    baseUrl={baseUrl}
                    pending={gateway.isPending}
                    failed={gateway.isError}
                    onRetry={() => void gateway.refetch()}
                  />
                  {activeModel ? (
                    <LlmKeyTestPanel
                      key={secretId}
                      baseUrl={baseUrl}
                      models={testableModels}
                      selectedModel={activeModel}
                      onSelectModel={setSelectedTestModelId}
                      resolveApiKey={resolveApiKey}
                    />
                  ) : null}
                </div>
                <LlmKeyQuickstart
                  baseUrl={baseUrl}
                  pending={gateway.isPending}
                  failed={gateway.isError}
                  onRetry={() => void gateway.refetch()}
                  modelSlug={activeModel?.slug}
                  resolveApiKey={resolveApiKey}
                />
              </div>
            </div>
            <DialogFooter className="shrink-0 justify-end gap-2 border-t border-border pt-4">
              <Button type="button" onClick={finish}>
                {t("models.dialog.done")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} autoComplete="off" className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="shrink-0 pr-10">
              <DialogTitle>{t("models.dialog.title")}</DialogTitle>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="llm-key-name">{t("common.labels.name")}</Label>
                <Input
                  id="llm-key-name"
                  value={name}
                  maxLength={31}
                  required
                  autoComplete="off"
                  disabled={mutation.isPending}
                  className="font-mono"
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="llm-key-description">{t("common.labels.description")}</Label>
                <Input
                  id="llm-key-description"
                  value={description}
                  autoComplete="off"
                  disabled={mutation.isPending}
                  placeholder={t("models.dialog.descriptionPlaceholder")}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium">{t("models.dialog.models")}</p>
                {models.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("models.dialog.noModels")}</p>
                ) : (
                  <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                    {models.map((model) => {
                      const label = modelDisplayName(model)
                      const canRemove = models.length > 1 && !mutation.isPending
                      return (
                        <Badge key={model.id} title={model.slug} className={cn("h-7 max-w-full", canRemove && "gap-0.5 pr-1")}>
                          <span className="truncate">{label}</span>
                          {canRemove ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-5 shrink-0 rounded-full p-0"
                              aria-label={t("models.dialog.removeModel", { name: label })}
                              onClick={() => onRemoveModel(model.id)}
                            >
                              <X className="size-3.5" aria-hidden />
                            </Button>
                          ) : null}
                        </Badge>
                      )
                    })}
                  </div>
                )}
              </div>
              {mutation.isPending ? (
                <p role="status" className="text-sm text-muted-foreground">{t(`models.${step}`)}</p>
              ) : null}
              {mutation.isError ? (
                <p role="alert" className="text-sm text-destructive">{mutation.error.message || t("models.error")}</p>
              ) : null}
            </div>
            <DialogFooter className="shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => handleOpenChange(false)}
              >
                {t("common.actions.cancel")}
              </Button>
              <Button type="submit" disabled={!name.trim() || models.length === 0 || mutation.isPending}>
                {mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
                {mutation.isPending ? t("common.creating") : t("models.dialog.create")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
