import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Copy, Eye, EyeOff, KeyRound, X } from "lucide-react"
import { useTranslation } from "react-i18next"
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
  cn,
} from "@sb0rka/ui"
import { useConfirmDialog } from "@/components/confirm-dialog-provider"
import { useToast } from "@sb0rka/ui"
import {
  useAttachResourceTag,
  useDetachResourceTag,
  useDeleteSecret,
  useResourceTags,
  useRevealSecretValue,
  useUpdateSecretValue,
  useSecret,
  useUpdateSecretMetadata,
} from "../hooks"
import { isLlmKeySecret } from "../llm-keys-utils"
import { formatDraftTagLabel } from "../parse-draft-tag"
import { AddTagDialog } from "./add-tag-dialog"
import type { SecretRow } from "./project-detail-tab-types"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import type { TagResponse } from "../api"
import {
  getErrorMessage,
  normalizeSecretDescription,
  useCopyHint,
} from "./secret-detail-helpers"
import { SecretVersions, listPreviousVersions } from "./secret-version-table"
import { SecretInfo } from "./secret-info"
import { LlmSecretDetails } from "./llm-secret-details"

interface SecretDetailsProps {
  projectId: string
  secret: SecretRow
  onClose: () => void
}

function SecretTitleRow({
  secret,
  secretPublicId,
}: {
  secret: SecretRow
  secretPublicId: string
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-6">
      <h3
        className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight md:text-2xl"
        title={secret.name}
      >
        {secret.name}
      </h3>
      <SecretPublicId publicId={secretPublicId} />
    </div>
  )
}

function SecretPublicId({ publicId }: { publicId: string }) {
  const { t } = useTranslation()
  const { message, copy } = useCopyHint()

  return (
    <div className="relative mr-1 flex min-w-0 shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={() => void copy(publicId)}
        className={cn(
          "inline-flex shrink-0 items-center justify-center text-muted-foreground",
          buttonPressClass,
        )}
        aria-label={t("secrets.copyPublicId")}
      >
        <Copy className="size-4 shrink-0" />
      </button>
      <span className="max-w-[14rem] truncate text-left text-sm leading-5 text-muted-foreground">
        {publicId}
      </span>
      <FloatingHint message={message} placement="bottom" align="end" />
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
  const [secretDescription, setSecretDescription] = useState(() =>
    normalizeSecretDescription(secretQuery.data?.description),
  )
  const [descriptionFocused, setDescriptionFocused] = useState(false)
  const secretPublicId = secretQuery.data?.public_id ?? secret.id
  // An LLM key owns a generated value and a model allowlist, so the generic
  // value editor and version list would let users break the key by hand.
  const isLlmKey = secretQuery.data ? isLlmKeySecret(secretQuery.data) : false

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

  const versions = listPreviousVersions(secretQuery.data)

  const versionsErrorMessage = secretQuery.isError
    ? getErrorMessage(secretQuery.error, t("secrets.versionsError"))
    : null
  const showVersionsCard = !isLlmKey && (Boolean(versionsErrorMessage) || versions.length > 0)

  return (
    <PageStagger className="flex flex-col gap-6">
      <SlideIn className="flex flex-col gap-2">
        <SecretTitleRow secret={secret} secretPublicId={secretPublicId} />
        <SecretTags
          tags={tagsQuery.data?.tags}
          isDetaching={detachResourceTag.isPending}
          detachingTagId={detachResourceTag.variables?.tagId}
          onOpenAddTag={() => setIsTagModalOpen(true)}
          onDetach={async (tagId) => {
            try {
              await detachResourceTag.mutateAsync({ resourceId: secret.id, tagId })
              showSuccess(t("common.messages.tagDetached"))
            } catch (err) {
              showError(getErrorMessage(err, t("common.messages.tagDetachError")))
            }
          }}
        />
      </SlideIn>

      {isLlmKey && secretQuery.data ? (
        <LlmSecretDetails
          projectId={projectId}
          secret={secretQuery.data}
          onDeleted={onClose}
        />
      ) : secretQuery.isPending ? (
        <SlideIn>
          <Card>
            <CardContent className="py-6">
              <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p>
            </CardContent>
          </Card>
        </SlideIn>
      ) : (
        <>
          <SlideIn className="hidden md:block">
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <SecretInfo
                  secret={secretQuery.data}
                  description={descriptionDraft}
                  onDescriptionChange={setSecretDescription}
                  descriptionFocused={descriptionFocused}
                  onDescriptionFocusedChange={setDescriptionFocused}
                  descriptionChanged={descriptionChanged}
                  savePending={updateSecretMetadata.isPending}
                  onSave={() => void updateSecretDescription()}
                  refreshPending={secretQuery.isFetching}
                  onRefresh={() => {
                    void secretQuery.refetch().then((result) => {
                      if (result.error) {
                        showError(getErrorMessage(result.error, t("secrets.refreshError")))
                      }
                    })
                  }}
                />
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
                        className="min-w-[70.25px] shrink-0"
                        onClick={() => handleUpdateDialogOpenChange(true)}
                        disabled={revealSecretValue.isPending || updateSecretValue.isPending}
                      >
                        {t("secrets.updateValue")}
                      </Button>
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
                        size="icon"
                        className="shrink-0"
                        onClick={() => handleToggleSecretValue()}
                        disabled={revealSecretValue.isPending}
                        aria-label={isValueVisible ? t("common.actions.hide") : t("common.actions.show")}
                      >
                        {isValueVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
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
                <CardContent className="p-0">
                  <SecretVersions
                    projectId={projectId}
                    secretId={secret.id}
                    secretName={secret.name}
                    versions={versions}
                    errorMessage={versionsErrorMessage}
                  />
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
        </>
      )}

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

function SecretTags({
  tags,
  isDetaching,
  detachingTagId,
  onOpenAddTag,
  onDetach,
}: {
  tags: TagResponse[] | undefined
  isDetaching: boolean
  detachingTagId: number | undefined
  onOpenAddTag: () => void
  onDetach: (tagId: number) => Promise<void>
}) {
  const { t } = useTranslation()

  return (
    <SlideIn className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {tags?.map((tag) => {
          const canDetach = !tag.is_system && !tag.is_readonly
          const tagDetaching = isDetaching && detachingTagId === tag.id
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
                  disabled={tagDetaching}
                  aria-label={t("common.messages.tagDetach")}
                  onClick={() => void onDetach(tag.id)}
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
          onClick={onOpenAddTag}
        >
          {t("databases.addTag")}
        </Button>
      </div>
    </SlideIn>
  )
}
