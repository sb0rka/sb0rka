import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Copy, Eye, EyeOff, KeyRound, X } from "lucide-react"
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
  ScrollArea,
  Textarea,
  cn,
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
  useSecret,
  useDisableSecret,
  useSecretVersionValue,
  useUpdateSecretMetadata,
} from "../hooks"
import { formatDraftTagLabel } from "../parse-draft-tag"
import { AddTagDialog } from "./add-tag-dialog"
import type { SecretRow } from "./project-detail-tab-types"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import type { SecretVersionResponse, TagResponse } from "../api"

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

function useCopyHint() {
  const { t } = useTranslation()
  const [message, setMessage] = useState<string | null>(null)
  const timeoutRef = useRef<number | null>(null)

  const clear = useCallback(() => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setMessage(null)
  }, [])

  useEffect(() => clear, [clear])

  const copy = useCallback(
    async (text: string | undefined) => {
      if (!text) return
      const show = (next: string, durationMs: number) => {
        if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
        setMessage(next)
        timeoutRef.current = window.setTimeout(() => {
          setMessage(null)
          timeoutRef.current = null
        }, durationMs)
      }
      try {
        await navigator.clipboard.writeText(text)
        show(t("common.messages.copied"), 2000)
      } catch {
        show(t("common.messages.copyFailed"), 3000)
      }
    },
    [t],
  )

  return { message, copy, clear }
}

function SecretVersionRow({
  projectId,
  secretId,
  secretName,
  version,
}: {
  projectId: string
  secretId: string
  secretName: string
  version: SecretVersionResponse
}) {
  const { t } = useTranslation()
  const confirm = useConfirmDialog()
  const locale = getResolvedLanguage()

  const disableSecret = useDisableSecret(projectId, secretId)
  const { showSuccess, showError } = useToast()
  const { message: copyMessage, copy } = useCopyHint()

  const [requested, setRequested] = useState(false)
  const [visible, setVisible] = useState(false)
  const secretVersionValueQuery = useSecretVersionValue(
    projectId,
    secretId,
    version.version_no,
    requested,
  )

  async function handleDisableSecret(versionNo: number) {
    if (disableSecret.isPending) return

    const confirmed = await confirm({
      title: t("secrets.disableVersionTitle", {version: version.version_no}),
      description: t("secrets.disableVersionDescription"),
    })
    if (!confirmed) return

    try {
      await disableSecret.mutateAsync(versionNo)
      showSuccess(t("secrets.disabled", { name: secretName, version: versionNo }))
    } catch (error) {
      showError(getErrorMessage(error, t("secrets.disableError")))
    }
  }

  useEffect(() => {
    if (requested && secretVersionValueQuery.data?.value) setVisible(true)
  }, [requested, secretVersionValueQuery.data?.value])

  const maskedValue = "•••••••••••••••••••••••"
  const plaintext = secretVersionValueQuery.data?.value
  const displayedValue = visible && plaintext ? plaintext : maskedValue
  const isActive = version.state === "active"

  function handleToggleSecretValue() {
    if (visible) {
      setVisible(false)
      return
    }

    setRequested(true)
    if (secretVersionValueQuery.data?.value) setVisible(true)
  }

  function handleCopySecretValue() {
    if (!plaintext || secretVersionValueQuery.isFetching) return
    void copy(plaintext)
  }

  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3",
        isActive
          ? "[grid-template-areas:'meta_date'_'value_value'_'actions_actions']"
          : "[grid-template-areas:'meta_date']",
        "lg:grid-cols-[1rem_minmax(0,1fr)_auto_7.5rem_11.5rem] lg:gap-x-4 lg:[grid-template-areas:'num_value_actions_status_date']",
      )}
    >
      <div className="flex min-w-0 items-center gap-3 [grid-area:meta] lg:contents">
        <p className="text-sm font-medium tabular-nums text-foreground lg:[grid-area:num]">
          {version.version_no}
        </p>
        <Badge
          className="w-fit shrink-0 lg:justify-self-center lg:[grid-area:status]"
          variant={isActive ? "active" : "inactive"}
        >
          {isActive ? t("secrets.active") : t("secrets.inactive")}
        </Badge>
      </div>
      <div className={cn("min-w-0 [grid-area:value]", !isActive && "hidden lg:block")}>
        {isActive ? (
          <p className="min-h-9 truncate rounded-md bg-secondary px-2.5 py-2 text-left font-mono text-xs font-semibold leading-5 text-muted-foreground">
            {displayedValue}
          </p>
        ) : null}
      </div>
      <div
        className={cn(
          "relative flex items-center gap-2 [grid-area:actions]",
          !isActive && "hidden lg:block",
        )}
      >
        {isActive ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={handleCopySecretValue}
              disabled={!plaintext || secretVersionValueQuery.isFetching}
              title={t("secrets.copySecret")}
              aria-label={t("secrets.copySecret")}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => handleToggleSecretValue()}
              disabled={secretVersionValueQuery.isFetching}
              aria-label={visible ? t("common.actions.hide") : t("common.actions.show")}
            >
              {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => void handleDisableSecret(version.version_no)}
              disabled={disableSecret.isPending}
              title={t("secrets.disableVersion")}
              aria-label={t("secrets.disableVersion")}
            >
              <X className="h-4 w-4" />
            </Button>
            <FloatingHint message={copyMessage} placement="bottom" align="end" />
          </>
        ) : null}
      </div>
      <p className="justify-self-end whitespace-nowrap text-xs text-muted-foreground [grid-area:date] sm:text-sm">
        {formatDateTime(version.created_at, locale)}
      </p>
    </li>
  )
}

export function SecretDetails({ projectId, secret, onClose }: SecretDetailsProps) {
  const { t } = useTranslation()
  const locale = getResolvedLanguage()
  const confirm = useConfirmDialog()
  const { showSuccess, showError } = useToast()
  const tagsQuery = useResourceTags(projectId, secret.id)
  const attachResourceTag = useAttachResourceTag(projectId)
  const detachResourceTag = useDetachResourceTag(projectId)
  const secretQuery = useSecret(projectId, secret.id)
  const secretValueQuery = useSecretValue(projectId, secret.id)
  const updateSecretMetadata = useUpdateSecretMetadata(projectId, secret.id)
  const deleteSecret = useDeleteSecret(projectId, secret.id)
  const updateSecretValue = useUpdateSecretValue(projectId)

  const [isValueVisible, setIsValueVisible] = useState(false)
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false)
  const [updateValueDraft, setUpdateValueDraft] = useState("")
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)
  const { message: copySecretMessage, copy: copyText, clear: clearCopyHint } = useCopyHint()
  const [secretDescription, setSecretDescription] = useState(secretQuery.data?.description)
  
  useEffect(() => {
    setSecretDescription(secretQuery.data?.description)
  }, [secretQuery.data?.description])

  useEffect(() => {
    setIsValueVisible(false)
    setIsUpdateDialogOpen(false)
    setUpdateValueDraft("")
    setIsTagModalOpen(false)
    clearCopyHint()
  }, [secret.id, clearCopyHint])

  function handleToggleSecretValue() {
    if (isValueVisible) {
      setIsValueVisible(false)
      clearCopyHint()
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
  
  function handleCopySecretValue() {
    if (!plaintext || secretValueQuery.isFetching) return
    void copyText(plaintext)
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
      clearCopyHint()
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

  const savedDescription = secretQuery.data?.description ?? ""
  const descriptionDraft = secretDescription ?? ""
  const descriptionChanged = descriptionDraft !== savedDescription

  async function updateSecretDescription() {
    if (!descriptionChanged || updateSecretMetadata.isPending) return

    try {
      await updateSecretMetadata.mutateAsync({ description: descriptionDraft })
      showSuccess(t("secrets.updateDescriptionSuccess"))
    } catch (error) {
      showError(getErrorMessage(error, t("secrets.updateDescriptionError")))
    }
  }

  const maskedValue = "•••••••••••••••••••••••"
  const plaintext = secretValueQuery.data?.value
  const displayedValue = isValueVisible && plaintext ? plaintext : maskedValue
  const revealErrorMessage = secretValueQuery.isError
    ? getErrorMessage(secretValueQuery.error, t("secrets.revealError"))
    : null

  const versions = [...(secretQuery.data?.versions ?? [])]
    .filter((version) => version.version_no !== secretQuery.data?.current_version_no)
    .sort((left, right) => right.version_no - left.version_no)
  const versionsErrorMessage = secretQuery.isError
    ? getErrorMessage(secretQuery.error, t("secrets.versionsError"))
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
                <Badge key={tag.id} className={cn("h-7", canDetach ? "gap-0.5 pr-1" : undefined)}>
                  <span className="flex h-5 items-center leading-none [text-box:trim-both_ex_alphabetic]">
                    {formatDraftTagLabel(tag)}
                  </span>
                  {canDetach ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 rounded-full p-0 leading-none"
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
                      <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                    </Button>
                  ) : null}
                </Badge>
              )
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-2.5 text-xs font-semibold leading-none [text-box:trim-both_ex_alphabetic]"
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
          <CardContent className="grid grid-cols-1 items-start gap-4 px-4 py-4 md:grid-cols-2 sm:gap-x-6 sm:p-6 lg:grid-cols-4">
            <div className="col-start-1 row-start-1 flex flex-col gap-1.5">
              <p className="text-sm font-medium text-foreground">{t("secrets.secretDescription")}</p>
              <Textarea
                value={descriptionDraft}
                onChange={(event) => setSecretDescription(event.target.value)}
              />
            </div>
            <div className="col-start-1 row-start-2">
              <Button type="button" onClick={() => void updateSecretDescription()}>
                {t("secrets.updateDescription")}
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-foreground">{t("secrets.purpose")}</p>
              <p className="text-base text-muted-foreground">{"—"}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-foreground">{t("secrets.createdBy")}</p>
              <p className="text-base text-muted-foreground">
                {secretQuery.data?.created_by_subject_id || "—"}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="text-sm font-medium text-foreground">{t("common.labels.createdAt")}</p>
              <p className="text-base text-muted-foreground">
                {formatDateTime(secretQuery.data?.created_at, locale)}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-foreground">{t("secrets.payloadKind")}</p>
              <p className="text-base text-muted-foreground">{secretQuery.data?.payload_kind || "—"}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-foreground">{t("secrets.scheduledDestroyAt")}</p>
              <p className="text-base text-muted-foreground">
                {formatDateTime(secretQuery.data?.scheduled_destroy_at, locale) || "—"}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-foreground">{t("common.labels.updatedAt")}</p>
              <p className="text-base text-muted-foreground">
                {formatDateTime(secretQuery.data?.updated_at, locale) || "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      </SlideIn>

      <SlideIn>
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-[20px] font-semibold tracking-tight">
              {t("secrets.key")}
              {secretQuery.data?.current_version_no ? (
                <Badge variant="active" className="ml-2">
                  {t("secrets.currentVersion")}: {secretQuery.data?.current_version_no}
                </Badge>
              ) : null}
            </CardTitle>
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
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-[20px] font-semibold tracking-tight">
              {t("secrets.versionsTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-2">
            {secretQuery.isPending ? (
              <p className="pb-4 text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : versionsErrorMessage ? (
              <p className="pb-4 text-sm text-destructive">{versionsErrorMessage}</p>
            ) : versions.length === 0 ? (
              <p className="pb-4 text-sm text-muted-foreground">
                {t("secrets.versionsEmpty")}
              </p>
            ) : (
              <ScrollArea 
                type="always"
                className="max-h-[360px] [&_[data-radix-scroll-area-viewport]]:max-h-[360px]"
              >
                <ul className="w-full pr-3 divide-y divide-border">
                  {versions.map((version) => (
                    <SecretVersionRow
                      key={version.version_no}
                      projectId={projectId}
                      secretId={secret.id}
                      secretName={secret.name}
                      version={version}
                    />
                  ))}
                </ul>
              </ScrollArea>
            )}
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
