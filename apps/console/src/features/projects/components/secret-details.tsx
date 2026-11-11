import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Copy, Eye, EyeOff, KeyRound, Pencil, RefreshCw, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { ApiError } from "@/lib/api-client"
import {
  Badge,
  Button,
  buttonPressClass,
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
  ScrollBar,
  Textarea,
  cn,
} from "@sb0rka/ui"
import { useConfirmDialog } from "@/components/confirm-dialog-provider"
import { useToast } from "@sb0rka/ui"
import { formatDateTime } from "@/lib/format-date"
import {
  useAttachResourceTag,
  useDetachResourceTag,
  useDeleteSecret,
  useResourceTags,
  useRevealSecretValue,
  useUpdateSecretValue,
  useSecret,
  useDisableSecret,
  useRevealSecretVersionValue,
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

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

function normalizeSecretDescription(value: string | undefined): string {
  const trimmed = value?.trim() ?? ""
  if (!trimmed || trimmed === "—") return ""
  return value ?? ""
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

const VERSION_TABLE_COLUMNS =
  "md:grid-cols-[minmax(5.5rem,9%)_minmax(0,1fr)_minmax(7rem,16%)_minmax(11rem,18%)]"

function SecretVersionRow({
  projectId,
  secretId,
  secretName,
  version,
  isLastRow,
}: {
  projectId: string
  secretId: string
  secretName: string
  version: SecretVersionResponse
  isLastRow: boolean
}) {
  const { t } = useTranslation()
  const confirm = useConfirmDialog()

  const disableSecret = useDisableSecret(projectId, secretId)
  const { showSuccess, showError } = useToast()
  const { message: copyMessage, copy: copyText, clear: clearCopyHint } = useCopyHint()

  const [visible, setVisible] = useState(false)
  const revealSecretVersionValue = useRevealSecretVersionValue(
    projectId,
    secretId,
    version.version_no,
  )
  const resetRevealedVersion = revealSecretVersionValue.reset

  const clearRevealedVersion = useCallback(() => {
    setVisible(false)
    resetRevealedVersion()
    clearCopyHint()
  }, [clearCopyHint, resetRevealedVersion])

  useEffect(() => {
    clearRevealedVersion()
  }, [version.version_no, clearRevealedVersion])

  async function handleDisableSecret(versionNo: number) {
    if (disableSecret.isPending) return

    const confirmed = await confirm({
      title: t("secrets.disableVersionTitle", {version: version.version_no}),
      description: t("secrets.disableVersionDescription"),
    })
    if (!confirmed) return

    try {
      await disableSecret.mutateAsync(versionNo)
      clearRevealedVersion()
      showSuccess(t("secrets.disabled", { name: secretName, version: versionNo }))
    } catch (error) {
      showError(getErrorMessage(error, t("secrets.disableError")))
    }
  }

  const maskedValue = "•••••••••••••••••••••••"
  const plaintext = revealSecretVersionValue.data?.value
  const displayedValue = visible && plaintext ? plaintext : maskedValue
  const isActive = version.state === "active"
  const canReveal = isActive || version.state === "disabled"

  async function handleToggleSecretValue() {
    if (visible) {
      clearRevealedVersion()
      return
    }

    try {
      const revealed = await revealSecretVersionValue.mutateAsync()
      if (!revealed.value) {
        resetRevealedVersion()
        return
      }
      setVisible(true)
    } catch {
      showError(getErrorMessage(revealSecretVersionValue.error, t("secrets.revealError")))
    }
  }

  async function handleCopySecretValue() {
    if (revealSecretVersionValue.isPending) return

    try {
      if (visible) {
        await copyText(revealSecretVersionValue.data?.value)
        return
      }

      const revealed = await revealSecretVersionValue.mutateAsync()
      await copyText(revealed.value)
      resetRevealedVersion()
    } catch {
      showError(getErrorMessage(revealSecretVersionValue.error, t("secrets.revealError")))
    }
  }

  const statusLabel = isActive ? t("secrets.active") : t("secrets.inactive")
  const statusVariant = isActive ? "active" : "inactive"

  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-center gap-x-3 gap-y-2 overflow-hidden py-3",
        canReveal
          ? "[grid-template-areas:'num_date'_'value_value']"
          : "[grid-template-areas:'num_date']",
        VERSION_TABLE_COLUMNS,
        "md:items-stretch md:gap-0 md:py-0 md:[grid-template-areas:'num_value_status_date']",
        !isLastRow && "border-b border-border md:border-b",
      )}
    >
      <div className="flex min-w-0 items-center gap-3 [grid-area:num] md:min-h-14 md:justify-center md:px-4 md:py-4">
        <p className="text-sm font-medium tabular-nums text-foreground">{version.version_no}</p>
        <Badge className="w-fit shrink-0 md:hidden" variant={statusVariant}>
          {statusLabel}
        </Badge>
      </div>
      <div className="hidden min-h-14 min-w-0 items-center justify-center px-4 py-4 [grid-area:status] md:flex">
        <Badge className="w-fit shrink-0" variant={statusVariant}>
          {statusLabel}
        </Badge>
      </div>
      <div
        className={cn(
          "relative flex min-w-0 flex-wrap items-center gap-2 [grid-area:value] md:min-h-14 md:flex-nowrap md:px-4 md:py-4",
          !canReveal && "hidden md:flex",
        )}
      >
        {canReveal ? (
          <>
            <input
              type="text"
              readOnly
              value={displayedValue}
              aria-label={t("secrets.valueLabel")}
              autoComplete="off"
              spellCheck={false}
              className="h-9 min-w-0 flex-1 basis-0 cursor-text rounded-md border-0 bg-secondary px-2.5 font-mono text-xs font-semibold text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => void handleCopySecretValue()}
              disabled={revealSecretVersionValue.isPending}
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
              onClick={() => void handleToggleSecretValue()}
              disabled={revealSecretVersionValue.isPending}
              aria-label={visible ? t("common.actions.hide") : t("common.actions.show")}
            >
              {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
            {isActive ? (
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
            ) : (
              <span className="h-9 w-9 shrink-0" aria-hidden="true" />
            )}
            <FloatingHint message={copyMessage} placement="bottom" align="end" />
          </>
        ) : null}
      </div>
      <p className="min-w-0 max-w-full justify-self-end truncate text-xs text-foreground [grid-area:date] sm:text-sm md:flex md:min-h-14 md:items-center md:justify-center md:justify-self-stretch md:px-4 md:py-4 md:text-center md:text-sm">
        {formatDateTime(version.created_at)}
      </p>
    </div>
  )
}

export function SecretDetails({ projectId, secret, onClose }: SecretDetailsProps) {
  const { t } = useTranslation()
  const confirm = useConfirmDialog()
  const { showSuccess, showError } = useToast()
  const tagsQuery = useResourceTags(projectId, secret.id)
  const attachResourceTag = useAttachResourceTag(projectId)
  const detachResourceTag = useDetachResourceTag(projectId)
  const secretQuery = useSecret(projectId, secret.id)
  const creatorId = secretQuery.data?.created_by_subject_id
  const creatorKind = secretQuery.data?.created_by_subject_kind
  const creatorLabel = creatorId
    ? `${creatorKind ? `${creatorKind} ` : ""}${creatorId.slice(0, 12)}...`
    : "—"
  const revealSecretValue = useRevealSecretValue(projectId, secret.id)
  const resetRevealedSecret = revealSecretValue.reset
  const updateSecretMetadata = useUpdateSecretMetadata(projectId, secret.id)
  const deleteSecret = useDeleteSecret(projectId, secret.id)
  const updateSecretValue = useUpdateSecretValue(projectId)

  const [isValueVisible, setIsValueVisible] = useState(false)
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false)
  const [updateValueDraft, setUpdateValueDraft] = useState("")
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)
  const { message: copySecretMessage, copy: copyText, clear: clearCopyHint } = useCopyHint()
  const { message: copyIdMessage, copy: copyPublicId } = useCopyHint()
  const versionsHeaderRef = useRef<HTMLDivElement>(null)
  const versionsViewportRef = useRef<HTMLDivElement>(null)
  const [secretDescription, setSecretDescription] = useState(() =>
    normalizeSecretDescription(secretQuery.data?.description),
  )
  const [descriptionFocused, setDescriptionFocused] = useState(false)
  const secretPublicId = secretQuery.data?.public_id ?? secret.id

  const clearRevealedSecret = useCallback(() => {
    setIsValueVisible(false)
    resetRevealedSecret()
    clearCopyHint()
  }, [clearCopyHint, resetRevealedSecret])

  useEffect(() => {
    setSecretDescription(normalizeSecretDescription(secretQuery.data?.description))
  }, [secretQuery.data?.description])

  useEffect(() => {
    clearRevealedSecret()
    setIsUpdateDialogOpen(false)
    setUpdateValueDraft("")
    setIsTagModalOpen(false)
  }, [secret.id, clearRevealedSecret])

  async function handleToggleSecretValue() {
    if (isValueVisible) {
      clearRevealedSecret()
      return
    }

    try {
      const revealed = await revealSecretValue.mutateAsync()
      if (!revealed.value) {
        resetRevealedSecret()
        return
      }
      setIsValueVisible(true)
    } catch {
      showError(getErrorMessage(revealSecretValue.error, t("secrets.revealError")))
    }
  }
  
  async function handleCopySecretValue() {
    if (revealSecretValue.isPending) return

    try {
      if (isValueVisible) {
        await copyText(revealSecretValue.data?.value)
        return
      }

      const revealed = await revealSecretValue.mutateAsync()
      await copyText(revealed.value)
      resetRevealedSecret()
    } catch {
      showError(getErrorMessage(revealSecretValue.error, t("secrets.revealError")))
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
        secret_value: updateValueDraft,
      })
      handleUpdateDialogOpenChange(false)
      clearRevealedSecret()
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

  const savedDescription = normalizeSecretDescription(secretQuery.data?.description)
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
  const plaintext = revealSecretValue.data?.value
  const displayedValue = isValueVisible && plaintext ? plaintext : maskedValue

  const versions = [...(secretQuery.data?.versions ?? [])]
    .filter((version) => version.version_no !== secretQuery.data?.current_version_no)
    .sort((left, right) => right.version_no - left.version_no)

  useEffect(() => {
    const viewport = versionsViewportRef.current
    const header = versionsHeaderRef.current
    if (!viewport || !header) return
    const sync = () => {
      header.style.transform = `translateX(-${viewport.scrollLeft}px)`
    }
    sync()
    viewport.addEventListener("scroll", sync, { passive: true })
    return () => viewport.removeEventListener("scroll", sync)
  }, [versions.length])

  const versionsErrorMessage = secretQuery.isError
    ? getErrorMessage(secretQuery.error, t("secrets.versionsError"))
    : null
  const showVersionsCard =
    secretQuery.isPending || Boolean(versionsErrorMessage) || versions.length > 0

  return (
    <PageStagger className="flex flex-col gap-6">
      <SlideIn className="flex flex-col gap-2">
        <div className="flex min-w-0 items-center justify-between gap-6">
          <h3
            className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight md:text-2xl"
            title={secret.name}
          >
            {secret.name}
          </h3>
          <div className="relative mr-1 flex min-w-0 shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void copyPublicId(secretPublicId)}
              className={cn(
                "inline-flex shrink-0 items-center justify-center text-muted-foreground",
                buttonPressClass,
              )}
              aria-label={t("secrets.copyPublicId")}
            >
              <Copy className="size-4 shrink-0" />
            </button>
            <span className="max-w-[14rem] truncate text-left text-sm leading-5 text-muted-foreground">
              {secretPublicId}
            </span>
            <FloatingHint message={copyIdMessage} placement="bottom" align="end" />
          </div>
        </div>
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
          <CardContent className="grid grid-cols-1 items-stretch gap-4 px-4 py-4 md:grid-cols-2 sm:gap-x-6 sm:p-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,0.6fr)_minmax(0,0.9fr)_minmax(0,0.8fr)] lg:gap-x-6">
            <div className="col-start-1 row-start-1 row-span-2 flex h-full min-h-0 min-w-0 flex-col gap-1.5">
              <p className="text-sm font-medium text-foreground">{t("secrets.secretDescription")}</p>
              <Textarea
                rows={1}
                value={descriptionDraft}
                onChange={(event) => setSecretDescription(event.target.value)}
                onFocus={() => setDescriptionFocused(true)}
                onBlur={() => setDescriptionFocused(false)}
                placeholder={descriptionFocused ? undefined : t("common.notAvailable")}
                title={descriptionDraft.trim() || undefined}
                aria-label={t("secrets.secretDescription")}
                className="min-h-0 flex-1 resize-none overflow-y-auto whitespace-pre-wrap break-words border-transparent px-0 pb-2 pt-0 text-sm leading-5 text-muted-foreground shadow-none focus-visible:border-input focus-visible:shadow-sm md:text-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="truncate text-sm font-medium text-foreground">{t("secrets.payloadKind")}</p>
              <p
                className="truncate text-sm leading-5 text-muted-foreground"
                title={secretQuery.data?.payload_kind || "—"}
              >
                {secretQuery.data?.payload_kind || "—"}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="truncate text-sm font-medium text-foreground">{t("secrets.createdBy")}</p>
              <p
                className="truncate text-sm leading-5 text-muted-foreground"
                title={creatorId ? `${creatorKind ? `${creatorKind} ` : ""}${creatorId}` : "—"}
              >
                {creatorLabel}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="truncate text-sm font-medium text-foreground">{t("common.labels.createdAt")}</p>
              <p
                className="truncate text-sm leading-5 text-muted-foreground"
                title={formatDateTime(secretQuery.data?.created_at)}
              >
                {formatDateTime(secretQuery.data?.created_at)}
              </p>
            </div>
            <div className="flex min-w-0 items-center gap-2 self-end">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                disabled={!descriptionChanged || updateSecretMetadata.isPending}
                onClick={() => void updateSecretDescription()}
                title={t("secrets.updateDescription")}
                aria-label={t("secrets.updateDescription")}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                disabled={secretQuery.isFetching}
                onClick={() => {
                  void secretQuery.refetch().then((result) => {
                    if (result.error) {
                      showError(getErrorMessage(result.error, t("secrets.refreshError")))
                    }
                  })
                }}
                title={t("secrets.refresh")}
                aria-label={t("secrets.refresh")}
              >
                <RefreshCw
                  className={cn("h-4 w-4", secretQuery.isFetching && "animate-spin")}
                  aria-hidden
                />
              </Button>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="truncate text-sm font-medium text-foreground">{t("secrets.scheduledDestroyAt")}</p>
              <p
                className="truncate text-sm leading-5 text-muted-foreground"
                title={formatDateTime(secretQuery.data?.scheduled_destroy_at)}
              >
                {formatDateTime(secretQuery.data?.scheduled_destroy_at)}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="truncate text-sm font-medium text-foreground">{t("common.labels.updatedAt")}</p>
              <p
                className="truncate text-sm leading-5 text-muted-foreground"
                title={formatDateTime(secretQuery.data?.updated_at)}
              >
                {formatDateTime(secretQuery.data?.updated_at)}
              </p>
            </div>
          </CardContent>
        </Card>
      </SlideIn>

      <SlideIn>
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-[20px] font-semibold leading-none tracking-tight">
              {t("secrets.key")}
              {secretQuery.data?.current_version_no ? (
                <Badge variant="active" className="ml-4 align-text-bottom">
                  {t("secrets.currentVersion")}: {secretQuery.data?.current_version_no}
                </Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 pb-6">
            <div className="relative">
              <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
                <input
                  type="text"
                  readOnly
                  value={displayedValue}
                  aria-label={t("secrets.key")}
                  autoComplete="off"
                  spellCheck={false}
                  className="h-9 min-h-9 w-full min-w-0 cursor-text rounded-md border-0 bg-secondary px-2.5 font-mono text-xs font-semibold text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring md:flex-1 md:basis-0"
                />
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => void handleCopySecretValue()}
                    disabled={revealSecretValue.isPending}
                    title={t("secrets.copySecret")}
                    aria-label={t("secrets.copySecret")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-w-[70.25px] shrink-0"
                    onClick={() => handleUpdateDialogOpenChange(true)}
                    disabled={revealSecretValue.isPending || updateSecretValue.isPending}
                  >
                    {t("secrets.updateValue")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-w-[70.25px] shrink-0"
                    onClick={() => handleToggleSecretValue()}
                    disabled={revealSecretValue.isPending}
                  >
                    {isValueVisible ? t("common.actions.hide") : t("common.actions.show")}
                  </Button>
                </div>
              </div>
              <FloatingHint message={copySecretMessage} placement="bottom" align="end" />
            </div>
          </CardContent>
        </Card>
      </SlideIn>

      {showVersionsCard ? (
      <SlideIn>
        <Card>
          <CardContent className="pb-2 pt-6">
            {secretQuery.isPending ? (
              <p className="pb-4 text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : versionsErrorMessage ? (
              <p className="pb-4 text-sm text-destructive">{versionsErrorMessage}</p>
            ) : (
              <div className="flex max-h-[360px] min-w-0 flex-col">
                <div className="hidden shrink-0 overflow-hidden md:block">
                  <div
                    ref={versionsHeaderRef}
                    className={cn(
                      VERSION_TABLE_COLUMNS,
                      "grid w-full min-w-[860px] border-b border-border pr-3",
                    )}
                  >
                    <div className="flex h-12 min-w-0 items-center justify-center px-4 text-sm font-medium text-muted-foreground">
                      {t("secrets.version")}
                    </div>
                    <div className="flex h-12 min-w-0 items-center px-4 text-sm font-medium text-muted-foreground">
                      {t("secrets.valueLabel")}
                    </div>
                    <div className="flex h-12 min-w-0 items-center justify-center px-4 text-sm font-medium text-muted-foreground">
                      {t("common.labels.status")}
                    </div>
                    <div className="flex h-12 min-w-0 items-center justify-center px-4 text-sm font-medium text-muted-foreground">
                      {t("common.labels.createdAt")}
                    </div>
                  </div>
                </div>
                <ScrollArea
                  type="always"
                  viewportRef={versionsViewportRef}
                  className="max-h-[360px] md:max-h-[calc(360px-3rem)] [&_[data-radix-scroll-area-viewport]]:max-h-[inherit]"
                >
                  <div className="w-full pr-3 md:min-w-[860px]">
                    {versions.map((version, index) => (
                      <SecretVersionRow
                        key={version.version_no}
                        projectId={projectId}
                        secretId={secret.id}
                        secretName={secret.name}
                        version={version}
                        isLastRow={index === versions.length - 1}
                      />
                    ))}
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>
      </SlideIn>
      ) : null}

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
