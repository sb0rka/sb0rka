import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  RotateCw,
} from "lucide-react"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FloatingHint,
  cn,
  useToast,
} from "@sb0rka/ui"
import { useConfirmDialog } from "@/components/confirm-dialog-provider"
import { SlideIn } from "@/components/motion/page-entrance"
import {
  activeModelsQuery,
  getGateway,
  type SecretResponse,
} from "../api"
import {
  useDeleteSecret,
  useRevealSecretValue,
  useSecret,
  useSecretModels,
  useSetSecretModels,
  useUpdateSecretMetadata,
  useUpdateSecretValue,
} from "../hooks"
import {
  formatKeyDigestPreview,
  getCurrentLlmKeyDigest,
  mergeCatalogModels,
  sameModelIds,
} from "../llm-keys-utils"
import { LlmKeyQuickstart } from "./llm-key-usage"
import { LlmKeyTestPanel } from "./llm-key-test-panel"
import { ModelsTable } from "./models-table"
import {
  getErrorMessage,
  normalizeSecretDescription,
  useCopyHint,
} from "./secret-detail-helpers"
import { SecretInfo } from "./secret-info"
import { SecretVersions, listPreviousVersions } from "./secret-version-table"

const MANAGED_PANEL_ID = "llm-key-management-panel"
const CHECK_PANEL_ID = "llm-key-check-panel"

interface LlmSecretDetailsProps {
  projectId: string
  secret: SecretResponse
  onDeleted: () => void
}

export function LlmSecretDetails({
  projectId,
  secret,
  onDeleted,
}: LlmSecretDetailsProps) {
  const { t } = useTranslation()
  const confirm = useConfirmDialog()
  const { showSuccess, showError } = useToast()

  const secretQuery = useSecret(projectId, secret.public_id)
  const modelsQuery = useSecretModels(projectId, secret.public_id)
  const catalogQuery = useQuery(activeModelsQuery)
  const gateway = useQuery({
    queryKey: ["llm", "gateway"],
    queryFn: getGateway,
    retry: false,
  })

  const setModels = useSetSecretModels(projectId, secret.public_id)
  const rotateKey = useUpdateSecretValue(projectId)
  const updateMetadata = useUpdateSecretMetadata(projectId, secret.public_id)
  const revealKey = useRevealSecretValue(projectId, secret.public_id)
  const deleteKey = useDeleteSecret(projectId, secret.public_id)

  const { message: copyKeyMessage, copy: copyText, clear: clearCopyKey } = useCopyHint()
  const { message: copyUrlMessage, copy: copyUrl } = useCopyHint()

  const [isKeyVisible, setIsKeyVisible] = useState(false)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [isManagementOpen, setIsManagementOpen] = useState(false)
  const [isCheckOpen, setIsCheckOpen] = useState(false)
  const [draftModelIds, setDraftModelIds] = useState<Set<string> | null>(null)
  const [selectedTestModelId, setSelectedTestModelId] = useState<string | null>(null)
  const [testPrompt, setTestPrompt] = useState(() => t("models.dialog.testDefaultPrompt"))
  const [description, setDescription] = useState(() =>
    normalizeSecretDescription(secret.description),
  )
  const [descriptionFocused, setDescriptionFocused] = useState(false)

  const maskedKey = formatKeyDigestPreview(getCurrentLlmKeyDigest(secretQuery.data ?? secret))
  const currentVersionNo = secretQuery.data?.current_version_no ?? secret.current_version_no
  const baseUrl = gateway.data?.base_url

  const boundModels = useMemo(() => modelsQuery.data?.models ?? [], [modelsQuery.data])
  const editorModels = useMemo(
    () => mergeCatalogModels(catalogQuery.data?.models ?? [], boundModels),
    [boundModels, catalogQuery.data?.models],
  )
  const savedModelIds = useMemo(() => boundModels.map((model) => model.id), [boundModels])
  const savedModelIdSet = useMemo(() => new Set(savedModelIds), [savedModelIds])
  const selectedModelIds = useMemo(
    () => draftModelIds ?? new Set(savedModelIds),
    [draftModelIds, savedModelIds],
  )
  const modelsChanged = !sameModelIds(selectedModelIds, savedModelIds)
  const modelsLoading = modelsQuery.isPending || catalogQuery.isPending
  const { addedCount, removedCount } = useMemo(() => {
    let added = 0
    let removed = 0
    for (const id of selectedModelIds) if (!savedModelIds.includes(id)) added += 1
    for (const id of savedModelIds) if (!selectedModelIds.has(id)) removed += 1
    return { addedCount: added, removedCount: removed }
  }, [selectedModelIds, savedModelIds])

  const versions = listPreviousVersions(secretQuery.data ?? secret)
  const versionsErrorMessage = secretQuery.isError
    ? getErrorMessage(secretQuery.error, t("secrets.versionsError"))
    : null
  const testableModels = boundModels.filter((model) => Boolean(model.slug))
  const activeTestModel =
    testableModels.find((model) => model.id === selectedTestModelId) ?? testableModels[0]

  // Revealed plaintext never leaves memory: it is dropped whenever the key
  // changes, is hidden, or the panel unmounts.
  const revealedKeyRef = useRef<string | null>(null)
  const resetRevealedKey = revealKey.reset

  const clearPlaintext = useCallback(() => {
    revealedKeyRef.current = null
    setRevealedKey(null)
    setIsKeyVisible(false)
    resetRevealedKey()
    clearCopyKey()
  }, [clearCopyKey, resetRevealedKey])

  useEffect(() => {
    clearPlaintext()
    setDraftModelIds(null)
    setSelectedTestModelId(null)
    setTestPrompt(t("models.dialog.testDefaultPrompt"))
  }, [secret.public_id, clearPlaintext, t])

  // A rotation issues a new plaintext, so anything revealed for the old one is
  // stale. Unsaved model edits survive because they are unrelated to the value.
  useEffect(() => {
    clearPlaintext()
  }, [currentVersionNo, clearPlaintext])

  useEffect(() => {
    setDescription(normalizeSecretDescription(secretQuery.data?.description))
  }, [secretQuery.data?.description])

  useEffect(() => {
    return () => {
      revealedKeyRef.current = null
    }
  }, [])

  async function resolveApiKey(): Promise<string> {
    const cached = revealedKeyRef.current
    if (cached) return cached
    let revealed: { value: string }
    try {
      revealed = await revealKey.mutateAsync()
    } catch (error) {
      throw new Error(getErrorMessage(error, t("models.keys.revealError")))
    }
    if (!revealed.value) throw new Error(t("models.keys.revealError"))
    return revealed.value
  }

  async function handleToggleKey() {
    if (isKeyVisible) {
      clearPlaintext()
      return
    }
    try {
      const value = await resolveApiKey()
      // Only a key the user asked to see is cached; one-off copy and test
      // reveals drop the plaintext as soon as they finish.
      revealedKeyRef.current = value
      setRevealedKey(value)
      setIsKeyVisible(true)
    } catch (error) {
      showError(getErrorMessage(error, t("models.keys.revealError")))
    }
  }

  async function handleCopyKey() {
    try {
      const value = await resolveApiKey()
      await copyText(value)
      if (!isKeyVisible) {
        revealedKeyRef.current = null
        resetRevealedKey()
      }
    } catch (error) {
      showError(getErrorMessage(error, t("models.keys.revealError")))
    }
  }

  async function handleRotate() {
    if (rotateKey.isPending) return
    const confirmed = await confirm({
      title: t("models.keys.rotateTitle"),
      description: t("models.keys.rotateDescription"),
      confirmText: t("models.keys.rotate"),
    })
    if (!confirmed) return
    try {
      await rotateKey.mutateAsync({ resourceId: secret.public_id, secret_value: "" })
      clearPlaintext()
      showSuccess(t("models.keys.rotateSuccess"))
    } catch (error) {
      showError(getErrorMessage(error, t("models.keys.rotateError")))
    }
  }

  async function saveModels() {
    if (!modelsChanged || selectedModelIds.size === 0 || setModels.isPending) return
    try {
      await setModels.mutateAsync([...selectedModelIds])
      setDraftModelIds(null)
      showSuccess(t("models.keys.modelsSaved"))
    } catch (error) {
      showError(getErrorMessage(error, t("models.keys.modelsSaveError")))
    }
  }

  const savedDescription = normalizeSecretDescription(secretQuery.data?.description)
  const descriptionChanged = description !== savedDescription

  async function saveDescription() {
    if (!descriptionChanged || updateMetadata.isPending) return
    try {
      await updateMetadata.mutateAsync({ description })
      showSuccess(t("models.keys.descriptionSaved"))
    } catch (error) {
      showError(getErrorMessage(error, t("models.keys.descriptionError")))
    }
  }

  async function handleDelete() {
    if (deleteKey.isPending) return
    const confirmed = await confirm({
      title: t("models.keys.deleteTitle"),
      description: t("models.keys.deleteDescription"),
      strongConfirmValue: secret.name,
      confirmText: t("models.keys.deleteButton"),
      cancelText: t("common.actions.cancel"),
      confirmVariant: "destructive",
      infoNode: (
        <div className="flex flex-col items-center gap-3 px-6">
          <KeyRound className="size-8" aria-hidden />
          <p className="text-lg">{secret.name}</p>
          <p>{t("models.keys.typeNameToConfirm")}</p>
        </div>
      ),
    })
    if (!confirmed) return
    try {
      await deleteKey.mutateAsync()
      clearPlaintext()
      showSuccess(t("models.keys.deleteSuccess"))
      onDeleted()
    } catch (error) {
      showError(getErrorMessage(error, t("models.keys.deleteError")))
    }
  }

  const displayedKey = isKeyVisible && revealedKey ? revealedKey : maskedKey

  return (
    <>
      <SlideIn>
        <Card className="overflow-hidden">
          <CardContent className="grid grid-cols-1 gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-0 lg:divide-x lg:divide-border">
            <div className="flex min-w-0 flex-col gap-1.5 lg:pr-6">
              <p className="text-sm font-medium text-foreground">{t("models.dialog.apiKey")}</p>
              <div className="relative">
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={displayedKey}
                    aria-label={t("models.dialog.apiKey")}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-9 min-w-0 flex-1 cursor-text rounded-md border-0 bg-secondary px-2.5 font-mono text-xs font-semibold text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => void handleCopyKey()}
                    disabled={revealKey.isPending}
                    title={t("models.dialog.copyKey")}
                    aria-label={t("models.dialog.copyKey")}
                  >
                    <Copy className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => void handleToggleKey()}
                    disabled={revealKey.isPending}
                    title={t(isKeyVisible ? "common.actions.hide" : "common.actions.show")}
                    aria-label={t(isKeyVisible ? "common.actions.hide" : "common.actions.show")}
                  >
                    {isKeyVisible ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => void handleRotate()}
                    disabled={rotateKey.isPending}
                  >
                    <RotateCw className={cn("mr-2 size-4", rotateKey.isPending && "animate-spin")} aria-hidden />
                    {rotateKey.isPending ? t("models.keys.rotating") : t("models.keys.rotate")}
                  </Button>
                </div>
                <FloatingHint message={copyKeyMessage} placement="bottom" align="end" />
              </div>
              <p className="text-xs text-muted-foreground">{t("models.keys.valueHint")}</p>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5 lg:pl-6">
              <p className="text-sm font-medium text-foreground">{t("models.dialog.baseUrl")}</p>
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                  {baseUrl ? (
                    <div className="relative">
                      <div className="flex min-w-0 items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={baseUrl}
                          aria-label={t("models.dialog.baseUrl")}
                          autoComplete="off"
                          spellCheck={false}
                          className="h-9 min-w-0 flex-1 cursor-text rounded-md border-0 bg-secondary px-2.5 font-mono text-xs text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          onClick={() => void copyUrl(baseUrl)}
                          title={t("models.dialog.copyUrl")}
                          aria-label={t("models.dialog.copyUrl")}
                        >
                          <Copy className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                      <FloatingHint message={copyUrlMessage} placement="bottom" align="end" />
                    </div>
                  ) : gateway.isPending ? (
                    <p role="status" className="flex h-9 items-center text-sm text-muted-foreground">
                      {t("common.loading")}
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2" role="alert">
                      <p className="text-sm text-destructive">{t("models.dialog.gatewayUnavailable")}</p>
                      <Button type="button" variant="outline" size="sm" onClick={() => void gateway.refetch()}>
                        {t("models.retry")}
                      </Button>
                    </div>
                  )}
                </div>
                <div
                  tabIndex={0}
                  aria-expanded={isCheckOpen}
                  aria-controls={CHECK_PANEL_ID}
                  aria-label={t("models.keys.check")}
                  onClick={() => setIsCheckOpen((current) => !current)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      setIsCheckOpen((current) => !current)
                    }
                  }}
                  className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-input px-2.5 text-sm outline-none hover:bg-muted/40 focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <span>{t("models.keys.check")}</span>
                  <ChevronDown
                    className={cn(
                      "size-4 text-muted-foreground transition-transform",
                      isCheckOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("models.keys.gatewayHint")}</p>
            </div>
          </CardContent>
          {isCheckOpen ? (
            <div id={CHECK_PANEL_ID} className="border-t border-border px-4 py-4 sm:px-6">
              <div className="grid gap-8 md:grid-cols-2">
                <div className="h-full min-h-0 min-w-0">
                  {activeTestModel ? (
                    <LlmKeyTestPanel
                      key={secret.public_id}
                      baseUrl={baseUrl}
                      models={testableModels}
                      selectedModel={activeTestModel}
                      onSelectModel={setSelectedTestModelId}
                      prompt={testPrompt}
                      onPromptChange={setTestPrompt}
                      resolveApiKey={resolveApiKey}
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-3.5">
                      <p className="text-sm font-medium text-foreground">{t("models.dialog.testTitle")}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{t("models.keys.noModelsTestHint")}</p>
                    </div>
                  )}
                </div>
                <LlmKeyQuickstart
                  baseUrl={baseUrl}
                  pending={gateway.isPending}
                  failed={gateway.isError}
                  onRetry={() => void gateway.refetch()}
                  modelSlug={activeTestModel?.slug}
                  prompt={testPrompt}
                  resolveApiKey={resolveApiKey}
                />
              </div>
            </div>
          ) : null}
        </Card>
      </SlideIn>

      <SlideIn>
        <Card className="overflow-hidden">
          <div
            tabIndex={0}
            aria-expanded={isManagementOpen}
            aria-controls={MANAGED_PANEL_ID}
            aria-label={t("models.keys.manageTitle")}
            onClick={() => setIsManagementOpen((current) => !current)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                setIsManagementOpen((current) => !current)
              }
            }}
            className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 outline-none hover:bg-muted/40 focus-visible:ring-1 focus-visible:ring-ring sm:px-6"
          >
            <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">
              {t("models.keys.manageTitle")}
            </p>
            <p className="min-w-0 text-xs text-muted-foreground">
              {versions.length > 0
                ? t("models.keys.manageSummaryVersions", { count: versions.length })
                : t("models.keys.manageSummary")}
            </p>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                isManagementOpen && "rotate-180",
              )}
              aria-hidden
            />
          </div>

          {isManagementOpen ? (
            <div id={MANAGED_PANEL_ID} className="border-t border-border">
              <SecretInfo
                secret={secretQuery.data ?? secret}
                description={description}
                onDescriptionChange={setDescription}
                descriptionFocused={descriptionFocused}
                onDescriptionFocusedChange={setDescriptionFocused}
                descriptionChanged={descriptionChanged}
                savePending={updateMetadata.isPending}
                onSave={() => void saveDescription()}
                refreshPending={secretQuery.isFetching}
                onRefresh={() => {
                  void secretQuery.refetch().then((result) => {
                    if (result.error) {
                      showError(getErrorMessage(result.error, t("secrets.refreshError")))
                    }
                  })
                }}
                currentVersion={currentVersionNo || undefined}
              />

              {versionsErrorMessage || versions.length > 0 ? (
                <div className="border-t border-border">
                  <SecretVersions
                    projectId={projectId}
                    secretId={secret.public_id}
                    secretName={secret.name}
                    versions={versions}
                    errorMessage={versionsErrorMessage}
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-4 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{t("models.keys.deleteTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("models.keys.dangerDescription")}</p>
                </div>
                <Button
                  type="button"
                  variant="delete"
                  disabled={deleteKey.isPending}
                  onClick={() => void handleDelete()}
                >
                  {deleteKey.isPending ? t("common.deleting") : t("models.keys.deleteButton")}
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      </SlideIn>

      <SlideIn>
        <Card className="overflow-hidden">
          <CardHeader className="gap-1 pb-3">
            <CardTitle className="text-base">{t("models.keys.allowedModels")}</CardTitle>
            <CardDescription>{t("models.keys.allowedModelsHint")}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {modelsLoading ? (
              <p role="status" className="px-4 pb-6 text-sm text-muted-foreground sm:px-6">
                {t("common.loading")}
              </p>
            ) : modelsQuery.isError ? (
              <div role="alert" className="flex flex-col items-start gap-3 px-4 pb-6 sm:px-6">
                <p className="text-sm text-destructive">{t("models.keys.modelsLoadError")}</p>
                <Button type="button" variant="outline" onClick={() => void modelsQuery.refetch()}>
                  {t("models.retry")}
                </Button>
              </div>
            ) : editorModels.length === 0 ? (
              <p className="px-4 pb-6 text-sm text-muted-foreground sm:px-6">{t("models.empty")}</p>
            ) : (
              <ModelsTable
                models={editorModels}
                filterable
                searchable
                scopeFilter
                allowedIds={savedModelIdSet}
                layout="auto"
                maxHeightClassName="max-h-[30rem]"
                selection={{ selectedIds: selectedModelIds, onChange: setDraftModelIds }}
              />
            )}
          </CardContent>
          {modelsLoading || modelsQuery.isError || editorModels.length === 0 ? null : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 sm:px-6">
              <p className="min-w-0 text-sm text-muted-foreground">
                {selectedModelIds.size === 0
                  ? t("models.keys.modelsRequired")
                  : modelsChanged
                    ? t("models.keys.modelsDiff", { added: addedCount, removed: removedCount })
                    : t("models.keys.modelsInSync", { count: selectedModelIds.size })}
              </p>
              <div className="ml-auto flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!modelsChanged || setModels.isPending}
                  onClick={() => setDraftModelIds(null)}
                >
                  {t("models.keys.resetModels")}
                </Button>
                <Button
                  type="button"
                  disabled={!modelsChanged || selectedModelIds.size === 0 || setModels.isPending}
                  onClick={() => void saveModels()}
                >
                  {setModels.isPending ? t("common.saving") : t("common.actions.saveChanges")}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </SlideIn>

    </>
  )
}

