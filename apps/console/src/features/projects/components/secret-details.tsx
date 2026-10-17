import { useEffect, useState, type FormEvent } from "react"
import { Copy, KeyRound, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { ApiError } from "@/lib/api-client"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FloatingHint,
  Input,
  Label,
} from "@sb0rka/ui"
import { useConfirmDialog } from "@/components/confirm-dialog-provider"
import { useToast } from "@sb0rka/ui"
import { getResolvedLanguage } from "@/lib/i18n"
import {
  useAttachResourceTag,
  useDetachResourceTag,
  useDeleteSecret,
  useResourceTags,
  useSecretValue,
  useUpdateSecretValue,
} from "../hooks"
import { formatDraftTagLabel } from "../parse-draft-tag"
import { AddTagDialog } from "./add-tag-dialog"
import type { SecretRow } from "./project-detail-tab-types"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import type { TagResponse } from "../api"

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

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export function SecretDetails({ projectId, secret, onClose }: SecretDetailsProps) {
  const { t } = useTranslation()
  const locale = getResolvedLanguage()
  const confirm = useConfirmDialog()
  const { showSuccess, showError } = useToast()
  const tagsQuery = useResourceTags(projectId, secret.id)
  const attachResourceTag = useAttachResourceTag(projectId)
  const detachResourceTag = useDetachResourceTag(projectId)
  const secretValueQuery = useSecretValue(projectId, secret.id)
  const deleteSecret = useDeleteSecret(projectId, secret.id)
  const updateSecretValue = useUpdateSecretValue(projectId)

  const [isValueVisible, setIsValueVisible] = useState(false)
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false)
  const [updateValueDraft, setUpdateValueDraft] = useState("")
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)
  const [copySecretMessage, setCopySecretMessage] = useState<string | null>(null)

  useEffect(() => {
    setIsValueVisible(false)
    setIsUpdateDialogOpen(false)
    setUpdateValueDraft("")
    setIsTagModalOpen(false)
    setCopySecretMessage(null)
  }, [secret.id])

  function handleToggleSecretValue() {
    if (isValueVisible) {
      setIsValueVisible(false)
      setCopySecretMessage(null)
      return
    }

    const value = secretValueQuery.data?.value
    if (value) {
      setIsValueVisible(true)
      return
    }

    void secretValueQuery.refetch().then((result) => {
      if (result.data?.value) setIsValueVisible(true)
    })
  }

  async function handleCopySecretValue() {
    const value = secretValueQuery.data?.value
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

  function handleUpdateDialogOpenChange(next: boolean) {
    if (!next) {
      setUpdateValueDraft("")
    }
    setIsUpdateDialogOpen(next)
  }

  async function handleUpdateValueSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = updateValueDraft.trim()
    if (!trimmed || updateSecretValue.isPending) {
      return
    }

    try {
      await updateSecretValue.mutateAsync({
        resourceId: secret.id,
        secret_value: trimmed,
      })
      handleUpdateDialogOpenChange(false)
      setIsValueVisible(false)
      setCopySecretMessage(null)
      showSuccess(t("secrets.updateValueSuccess"))
    } catch (error) {
      showError(getErrorMessage(error, t("secrets.updateValueError")))
    }
  }

  async function handleDeleteSecret() {
    if (deleteSecret.isPending) return

    const infoNode = (
      <div className="flex flex-col items-center gap-3 px-6">
        <KeyRound className="h-8 w-8 shrink-0" id="icon" />
        <Label htmlFor="icon" className="text-lg">{secret.name}</Label>
        <p>{t("secrets.typeNameToConfirm")}</p>
      </div>
    )

    const confirmed = await confirm({
      title: t("secrets.deleteTitle"),
      description: t("secrets.deleteDescription"),
      infoNode,
      strongConfirmValue: secret.name,
      confirmText: t("common.actions.delete"),
      cancelText: t("common.actions.cancel"),
      confirmVariant: "destructive",
    })
    if (!confirmed) return

    try {
      await deleteSecret.mutateAsync()
      showSuccess(t("secrets.deleted"))
      onClose()
    } catch (error) {
      showError(getErrorMessage(error, t("secrets.deleteError")))
    }
  }

  const maskedValue = "•••••••••••••••••••••••"
  const plaintext = secretValueQuery.data?.value
  const displayedValue = isValueVisible && plaintext ? plaintext : maskedValue
  const revealErrorMessage = secretValueQuery.isError
    ? getErrorMessage(secretValueQuery.error, t("secrets.revealError"))
    : null

  return (
    <PageStagger className="flex flex-col gap-6">
      <SlideIn className="flex flex-col gap-2">
        <h3 className="text-base font-semibold tracking-tight md:text-2xl">{secret.name}</h3>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {tagsQuery.data?.tags.map((tag: TagResponse) => {
              const canDetach = !tag.is_system && !tag.is_readonly
              const isDetaching =
                detachResourceTag.isPending && detachResourceTag.variables?.tagId === tag.id
              return (
                <Badge key={tag.id} className={canDetach ? "gap-0.5 pr-0.5" : undefined}>
                  {formatDraftTagLabel(tag)}
                  {canDetach ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 shrink-0 rounded-full p-0"
                      disabled={isDetaching}
                      aria-label={t("common.messages.tagDetach")}
                      onClick={async () => {
                        try {
                          await detachResourceTag.mutateAsync({
                            resourceId: secret.id,
                            tagId: tag.id,
                          })
                          showSuccess(t("common.messages.tagDetached"))
                        } catch (err) {
                          showError(getErrorMessage(err, t("common.messages.tagDetachError")))
                        }
                      }}
                    >
                      <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </Button>
                  ) : null}
                </Badge>
              )
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-2.5 text-xs font-semibold"
              onClick={() => {
                setIsTagModalOpen(true)
              }}
            >
              {t("databases.addTag")}
            </Button>
          </div>
        </div>
      </SlideIn>

      <SlideIn className="hidden md:block">
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
      </SlideIn>

      <SlideIn>
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-[20px] font-semibold tracking-tight">{t("secrets.key")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 pb-6">
          <div className="relative">
            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
              <div className="min-w-0 w-full rounded-md bg-secondary px-3.5 py-2.5 md:flex-1">
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
      </SlideIn>

      <SlideIn>
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
              variant="delete"
              onClick={() => void handleDeleteSecret()}
              disabled={deleteSecret.isPending}
            >
              {deleteSecret.isPending ? t("common.deleting") : t("secrets.deleteButton")}
            </Button>
          </div>
        </CardFooter>
      </Card>
      </SlideIn>

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

      <AddTagDialog
        open={isTagModalOpen}
        onOpenChange={setIsTagModalOpen}
        inputId={`secret-draft-tag-${secret.id}`}
        isSubmitting={attachResourceTag.isPending}
        checkDuplicate={(parsed) =>
          tagsQuery.data?.tags.some(
            (tag: TagResponse) => tag.tag_key === parsed.tag_key && tag.tag_value === parsed.tag_value,
          )
            ? t("common.messages.tagDuplicate")
            : null
        }
        mapSubmitError={(err) => getErrorMessage(err, t("common.messages.tagAddError"))}
        onSubmit={async (parsed) => {
          await attachResourceTag.mutateAsync({
            resourceId: secret.id,
            data: parsed,
          })
          showSuccess(t("common.messages.tagAdded"))
        }}
      />
    </PageStagger>
  )
}
