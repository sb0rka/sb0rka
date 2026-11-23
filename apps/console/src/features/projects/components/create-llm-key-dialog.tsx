import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Copy, Eye, EyeOff, Loader2, X } from "lucide-react"
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  useToast,
} from "@sb0rka/ui"
import { getGateway, revealSecretValue, type LLMModel } from "../api"
import { chatCompletionsCurl, modelDisplayName } from "../models-utils"
import { suggestLlmKeyName, useCreateLlmKey } from "../use-create-llm-key"

interface CreateLlmKeyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  models: LLMModel[]
  onRemoveModel: (id: string) => void
}

export function CreateLlmKeyDialog({
  open,
  onOpenChange,
  projectId,
  models,
  onRemoveModel,
}: CreateLlmKeyDialogProps) {
  const { t } = useTranslation()
  const { showSuccess, showError } = useToast()
  const issuedModels = useRef<LLMModel[]>([])
  const wasOpen = useRef(open)
  const [name, setName] = useState(suggestLlmKeyName)
  const [description, setDescription] = useState("")
  const [visible, setVisible] = useState(false)
  const [secretValue, setSecretValue] = useState<string | null>(null)
  const [revealFailed, setRevealFailed] = useState(false)
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
    setName(suggestLlmKeyName())
    setDescription("")
    setVisible(false)
    setSecretValue(null)
    setRevealFailed(false)
  }, [open])

  function clearSecret() {
    setVisible(false)
    setSecretValue(null)
    setRevealFailed(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next && !mutation.isPending) {
      clearSecret()
      issuedModels.current = []
      reset()
    }
    onOpenChange(next)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const requested = name.trim()
    if (!requested || models.length === 0 || mutation.isPending || mutation.isSuccess) return
    issuedModels.current = models
    create({
      name: requested,
      description: description.trim() || undefined,
      modelIds: models.map((model) => model.id),
    })
  }

  const boundModels = issuedModels.current.length > 0 ? issuedModels.current : models
  const example = boundModels.find((model) => model.slug)
  const baseUrl = gateway.data?.base_url
  const command = baseUrl && example
    ? chatCompletionsCurl(baseUrl, example.slug, t("models.samplePrompt"))
    : null
  const secretsHref = secretId
    ? `/projects/${projectId}?tab=secrets&secret=${encodeURIComponent(secretId)}`
    : `/projects/${projectId}?tab=secrets`

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
      setSecretValue(revealed.value)
      setVisible(true)
      setRevealFailed(false)
    } catch {
      setRevealFailed(true)
    }
  }

  async function copySecret() {
    if (!secretId) return
    let value = visible ? secretValue : null
    if (!value) {
      try {
        value = (await revealSecretValue(projectId, secretId)).value
      } catch {
        showError(t("secrets.revealError"))
        return
      }
    }
    if (!value) return
    await copyText(value)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
        {ready && secretId ? (
          <>
            <DialogHeader className="pr-10">
              <DialogTitle>{t("models.dialog.readyTitle")}</DialogTitle>
              <DialogDescription>{t("models.dialog.readyDescription")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-5 px-6 pb-6">
              {boundModels.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {boundModels.map((model) => (
                    <Badge key={model.id}>{modelDisplayName(model)}</Badge>
                  ))}
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="llm-key-value">{t("models.dialog.apiKey")}</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="llm-key-value"
                    type="text"
                    readOnly
                    value={visible ? secretValue ?? "" : "••••••••••••••••"}
                    aria-label={t("models.dialog.apiKey")}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-9 min-w-0 flex-1 cursor-text rounded-md border-0 bg-secondary px-2.5 font-mono text-xs font-semibold text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("models.dialog.copyKey")}
                    onClick={() => void copySecret()}
                  >
                    <Copy className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t(visible ? "common.actions.hide" : "common.actions.show")}
                    onClick={() => void toggleSecret()}
                  >
                    {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                  </Button>
                </div>
                {revealFailed ? (
                  <p role="alert" className="text-sm text-destructive">{t("secrets.revealError")}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">{t("models.dialog.baseUrl")}</p>
                {baseUrl ? (
                  <div className="flex items-center gap-1 rounded-md border border-input px-2 py-1">
                    <code className="min-w-0 flex-1 break-all px-1 text-sm">{baseUrl}</code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={t("models.dialog.copyUrl")}
                      onClick={() => void copyText(baseUrl)}
                    >
                      <Copy className="size-4" aria-hidden />
                    </Button>
                  </div>
                ) : gateway.isPending ? (
                  <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p>
                ) : (
                  <div className="space-y-2" role="alert">
                    <p className="text-sm text-destructive">{t("models.dialog.gatewayUnavailable")}</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => void gateway.refetch()}>
                      {t("models.retry")}
                    </Button>
                  </div>
                )}
              </div>
              {command ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{t("models.dialog.curl")}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => void copyText(command)}
                    >
                      <Copy className="mr-2 size-3.5" aria-hidden />
                      {t("models.dialog.copyCurl")}
                    </Button>
                  </div>
                  <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed" dir="ltr">
                    <code>{command}</code>
                  </pre>
                  <p className="text-sm text-muted-foreground">{t("models.dialog.response")}</p>
                </div>
              ) : null}
            </div>
            <DialogFooter className="gap-2">
              <Button asChild variant="outline">
                <Link to={secretsHref}>{t("models.viewKey")}</Link>
              </Button>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                {t("models.dialog.done")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} autoComplete="off">
            <DialogHeader className="pr-10">
              <DialogTitle>{t("models.dialog.title")}</DialogTitle>
              <DialogDescription>{t("models.dialog.description")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 px-6 pb-6">
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
                  <ul className="flex max-h-40 flex-col gap-2 overflow-y-auto">
                    {models.map((model) => {
                      const label = modelDisplayName(model)
                      return (
                        <li key={model.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{label}</p>
                            <p className="truncate font-mono text-xs text-muted-foreground">{model.slug}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0"
                            disabled={models.length < 2 || mutation.isPending}
                            aria-label={t("models.dialog.removeModel", { name: label })}
                            onClick={() => onRemoveModel(model.id)}
                          >
                            <X className="size-4" aria-hidden />
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              {mutation.isPending ? (
                <p role="status" className="text-sm text-muted-foreground">{t(`models.${step}`)}</p>
              ) : null}
              {mutation.isError ? (
                <div role="alert" className="space-y-1">
                  <p className="text-sm text-destructive">{mutation.error.message || t("models.error")}</p>
                  <Link className="text-sm underline" to={`/projects/${projectId}?tab=secrets`}>
                    {t("models.openSecrets")}
                  </Link>
                </div>
              ) : null}
            </div>
            <DialogFooter className="gap-2">
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
