import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react"
import { Copy } from "lucide-react"
import { useTranslation } from "react-i18next"
import { ApiError } from "@/lib/api-client"
import { FloatingHint } from "@/components/ui/floating-hint"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useConfirmDialog } from "@/components/confirm-dialog-provider"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getResolvedLanguage } from "@/lib/i18n"
import {
  useAttachResourceTag,
  useDeactivateResource,
  useResourceTags,
  useSecretValue,
  useUpdateSecretValue,
} from "../hooks"
import type { SecretRow } from "./project-detail-tab-types"

interface SecretDetailsProps {
  projectId: string
  secret: SecretRow
  onClose: () => void
}

function formatDateTime(value: string | undefined, locale: string): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date)
}

function parseTagInput(input: string): { tag_key: string; tag_value: string } | null {
  const normalized = input.trim()
  if (!normalized) return null

  const separatorIndex = normalized.indexOf(":")
  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
    return null
  }

  const tag_key = normalized.slice(0, separatorIndex).trim()
  const tag_value = normalized.slice(separatorIndex + 1).trim()
  if (!tag_key || !tag_value) return null

  return { tag_key, tag_value }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export function SecretDetails({ projectId, secret, onClose }: SecretDetailsProps) {
  const { t } = useTranslation()
  const locale = getResolvedLanguage()
  const confirm = useConfirmDialog()
  const tagsQuery = useResourceTags(projectId, secret.id)
  const attachResourceTag = useAttachResourceTag(projectId)
  const secretValueQuery = useSecretValue(projectId, secret.id)
  const deactivateResource = useDeactivateResource(projectId, secret.id)
  const updateSecretValue = useUpdateSecretValue(projectId)

  const [isValueVisible, setIsValueVisible] = useState(false)
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false)
  const [updateValueDraft, setUpdateValueDraft] = useState("")
  const [updateValueError, setUpdateValueError] = useState<string | null>(null)
  const [newTagInput, setNewTagInput] = useState("")
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [tagActionError, setTagActionError] = useState<string | null>(null)
  const [tagActionSuccess, setTagActionSuccess] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [copySecretMessage, setCopySecretMessage] = useState<string | null>(null)

  useEffect(() => {
    setIsValueVisible(false)
    setIsUpdateDialogOpen(false)
    setUpdateValueDraft("")
    setUpdateValueError(null)
    setNewTagInput("")
    setIsAddingTag(false)
    setTagActionError(null)
    setTagActionSuccess(null)
    setDeleteError(null)
    setCopySecretMessage(null)
  }, [secret.id])

  function handleToggleSecretValue() {
    if (isValueVisible) {
      setIsValueVisible(false)
      setCopySecretMessage(null)
      return
    }

    const value = secretValueQuery.data?.secret_value
    if (value) {
      setIsValueVisible(true)
      return
    }

    void secretValueQuery.refetch().then((result) => {
      if (result.data?.secret_value) setIsValueVisible(true)
    })
  }

  async function handleCopySecretValue() {
    const value = secretValueQuery.data?.secret_value
    if (!value || secretValueQuery.isFetching) return
    try {
      await navigator.clipboard.writeText(value)
      setCopySecretMessage(t("secrets.copied"))
      window.setTimeout(() => setCopySecretMessage(null), 2000)
    } catch {
      setCopySecretMessage(t("common.messages.copyFailed"))
      window.setTimeout(() => setCopySecretMessage(null), 3000)
    }
  }

  async function handleAddTag() {
    if (attachResourceTag.isPending) return

    setTagActionError(null)
    setTagActionSuccess(null)

    const parsed = parseTagInput(newTagInput)
    if (!parsed) {
      setTagActionError(t("common.messages.tagFormat"))
      return
    }

    const duplicate = tagsQuery.data?.tags.some(
      (tag) => tag.tag_key === parsed.tag_key && tag.tag_value === parsed.tag_value,
    )
    if (duplicate) {
      setTagActionError(t("common.messages.tagDuplicate"))
      return
    }

    try {
      await attachResourceTag.mutateAsync({
        resourceId: secret.id,
        data: parsed,
      })
      setTagActionSuccess(t("common.messages.tagAdded"))
      setNewTagInput("")
      setIsAddingTag(false)
    } catch (error) {
      setTagActionError(getErrorMessage(error, t("common.messages.tagAddError")))
    }
  }

  function handleTagInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault()
      void handleAddTag()
    }
    if (event.key === "Escape") {
      setIsAddingTag(false)
      setNewTagInput("")
      setTagActionError(null)
    }
  }

  function handleUpdateDialogOpenChange(next: boolean) {
    if (!next) {
      setUpdateValueDraft("")
      setUpdateValueError(null)
    }
    setIsUpdateDialogOpen(next)
  }

  async function handleUpdateValueSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = updateValueDraft.trim()
    if (!trimmed || updateSecretValue.isPending) {
      return
    }

    setUpdateValueError(null)
    try {
      await updateSecretValue.mutateAsync({
        resourceId: secret.id,
        secret_value: trimmed,
      })
      handleUpdateDialogOpenChange(false)
      setIsValueVisible(false)
      setCopySecretMessage(null)
    } catch (error) {
      setUpdateValueError(getErrorMessage(error, t("secrets.updateValueError")))
    }
  }

  async function handleDeleteSecret() {
    if (deactivateResource.isPending) return

    const confirmed = await confirm({
      title: t("secrets.deleteTitle"),
      description: t("secrets.deleteDescription"),
      confirmText: t("common.actions.delete"),
      cancelText: t("common.actions.cancel"),
      confirmVariant: "destructive",
    })
    if (!confirmed) return

    setDeleteError(null)
    try {
      await deactivateResource.mutateAsync()
      window.alert(t("secrets.deleted"))
      onClose()
    } catch (error) {
      setDeleteError(getErrorMessage(error, t("secrets.deleteError")))
    }
  }

  const maskedValue = "•••••••••••••••••••••••"
  const plaintext = secretValueQuery.data?.secret_value
  const displayedValue = isValueVisible && plaintext ? plaintext : maskedValue
  const revealErrorMessage = secretValueQuery.isError
    ? getErrorMessage(secretValueQuery.error, t("secrets.revealError"))
    : null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-2xl font-semibold tracking-tight">{secret.name}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {tagsQuery.data?.tags.map((tag) => (
            <Badge
              key={tag.id}
              className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold leading-4 text-secondary-foreground hover:bg-secondary"
            >
              {`${tag.tag_key}:${tag.tag_value}`}
            </Badge>
          ))}
          {isAddingTag ? (
            <div className="flex items-center gap-2">
              <Input
                placeholder="key:value"
                value={newTagInput}
                onChange={(event) => setNewTagInput(event.target.value)}
                onKeyDown={handleTagInputKeyDown}
                className="h-8 w-[180px]"
                autoFocus
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleAddTag()}
                disabled={attachResourceTag.isPending}
              >
                {t("common.actions.add")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsAddingTag(false)
                  setNewTagInput("")
                  setTagActionError(null)
                }}
              >
                {t("common.actions.cancel")}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-5 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-4"
              onClick={() => {
                setIsAddingTag(true)
                setTagActionError(null)
                setTagActionSuccess(null)
              }}
            >
              {t("databases.addTag")}
            </Button>
          )}
        </div>
        {tagActionError ? <p className="text-sm text-destructive">{tagActionError}</p> : null}
        {tagActionSuccess ? <p className="text-sm text-emerald-600">{tagActionSuccess}</p> : null}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="grid gap-6 px-6 py-6 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-foreground">{t("common.labels.createdAt")}</p>
            <p className="text-base text-muted-foreground">{formatDateTime(secret.createdAt, locale)}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-foreground">{t("common.labels.updatedAt")}</p>
            <p className="text-base text-muted-foreground">{formatDateTime(secret.updatedAt, locale)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-[20px] font-semibold tracking-tight">{t("secrets.secret")}</CardTitle>
          <CardDescription>
            {t("secrets.lastViewed", { date: formatDateTime(secret.revealedAt, locale) })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5 pb-6">
          <p className="text-sm font-medium text-foreground">{t("secrets.key")}</p>
          <div className="relative">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1 rounded-md bg-secondary px-3.5 py-2.5">
                <p className="truncate font-mono text-xs font-semibold text-muted-foreground">
                  {displayedValue}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => void handleCopySecretValue()}
                  disabled={!plaintext || secretValueQuery.isFetching}
                  title={t("secrets.copySecret")}
                  aria-label={t("secrets.copySecret")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-[70.25px]"
                  onClick={() => handleUpdateDialogOpenChange(true)}
                  disabled={secretValueQuery.isFetching || updateSecretValue.isPending}
                >
                  {t("secrets.updateValue")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-[70.25px]"
                  onClick={() => handleToggleSecretValue()}
                  disabled={secretValueQuery.isFetching}
                >
                  {isValueVisible ? t("common.actions.hide") : t("common.actions.show")}
                </Button>
              </div>
            </div>
            <FloatingHint message={copySecretMessage} placement="bottom" align="end" />
          </div>
          {revealErrorMessage ? (
            <p className="text-sm text-destructive">{revealErrorMessage}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border pb-6">
          <CardTitle className="text-[20px] font-semibold tracking-tight">{t("projects.settings.dangerTitle")}</CardTitle>
          <CardDescription>
            {t("secrets.dangerDescription")}
          </CardDescription>
        </CardHeader>
        <CardFooter className="pt-6">
          <div className="flex flex-col gap-2">
            <Button
              className="self-start"
              variant="destructive"
              onClick={() => void handleDeleteSecret()}
              disabled={deactivateResource.isPending}
            >
              {deactivateResource.isPending ? t("common.deleting") : t("secrets.deleteButton")}
            </Button>
            {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          </div>
        </CardFooter>
      </Card>

      <Dialog open={isUpdateDialogOpen} onOpenChange={handleUpdateDialogOpenChange}>
        <DialogContent>
          <form onSubmit={handleUpdateValueSubmit} autoComplete="off">
            <DialogHeader>
              <DialogTitle>{t("secrets.updateValueTitle")}</DialogTitle>
              <DialogDescription>{t("secrets.updateValueDescription")}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 px-6 pb-6">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="update-secret-value">{t("secrets.valueLabel")}</Label>
                <Input
                  id="update-secret-value"
                  name="secret-value"
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  className="[-webkit-text-security:disc]"
                  placeholder={t("secrets.valuePlaceholder")}
                  value={updateValueDraft}
                  onChange={(e) => setUpdateValueDraft(e.target.value)}
                  autoFocus
                />
              </div>
              {updateValueError ? (
                <p className="text-sm text-destructive">{updateValueError}</p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleUpdateDialogOpenChange(false)}
                disabled={updateSecretValue.isPending}
              >
                {t("common.actions.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={
                  !updateValueDraft.trim() || updateSecretValue.isPending
                }
              >
                {updateSecretValue.isPending ? t("common.creating") : t("common.actions.saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
