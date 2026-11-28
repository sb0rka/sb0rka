import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ArrowUpRight, Copy, KeyRound } from "lucide-react"
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  useToast,
} from "@sb0rka/ui"
import { useConfirmDialog } from "@/components/confirm-dialog-provider"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import { ApiError } from "@/lib/api-client"
import { formatDateTime } from "@/lib/format-date"
import {
  activeModelsQuery,
  getGateway,
  revealSecretValue,
  type SecretVersionResponse,
} from "../api"
import {
  useDeleteSecret,
  useDisableSecret,
  useSecret,
  useSecretModels,
  useSetSecretModels,
} from "../hooks"
import {
  getActivePreviousVersions,
  isLlmKeySecret,
  mergeCatalogModels,
  sameModelIds,
} from "../llm-keys-utils"
import { LlmKeyQuickstart } from "./llm-key-usage"
import { LlmKeyTestPanel } from "./llm-key-test-panel"
import { ModelsTable } from "./models-table"

const maskedKey = "********************"

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function PreviousKeyRow({
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
  const { showSuccess, showError } = useToast()
  const disableSecret = useDisableSecret(projectId, secretId)

  async function revoke() {
    if (disableSecret.isPending) return
    const confirmed = await confirm({
      title: t("models.keys.revokeTitle", { version: version.version_no }),
      description: t("models.keys.revokeDescription", { name: secretName }),
      confirmText: t("models.keys.revoke"),
      confirmVariant: "destructive",
    })
    if (!confirmed) return
    try {
      await disableSecret.mutateAsync(version.version_no)
      showSuccess(t("models.keys.revokeSuccess", { version: version.version_no }))
    } catch (error) {
      showError(errorMessage(error, t("models.keys.revokeError")))
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-mono text-xs text-muted-foreground">{maskedKey}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("models.keys.versionMeta", {
            version: version.version_no,
            date: formatDateTime(version.created_at),
          })}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={disableSecret.isPending}
        onClick={() => void revoke()}
      >
        {t("models.keys.revoke")}
      </Button>
    </div>
  )
}

export function LlmKeyDetails({
  projectId,
  keyId,
  onClose,
}: {
  projectId: string
  keyId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const confirm = useConfirmDialog()
  const { showSuccess, showError } = useToast()
  const secretQuery = useSecret(projectId, keyId)
  const modelsQuery = useSecretModels(projectId, keyId)
  const catalogQuery = useQuery(activeModelsQuery)
  const setModels = useSetSecretModels(projectId, keyId)
  const deleteSecret = useDeleteSecret(projectId, keyId)
  const gateway = useQuery({
    queryKey: ["llm", "gateway"],
    queryFn: getGateway,
    retry: false,
  })
  const cachedSecretRef = useRef<string | null>(null)
  const [draftModelIds, setDraftModelIds] = useState<Set<string> | null>(null)
  const [selectedTestModelId, setSelectedTestModelId] = useState<string | null>(null)
  const [testPrompt, setTestPrompt] = useState(() => t("models.dialog.testDefaultPrompt"))

  const secret = secretQuery.data
  const isKey = secret ? isLlmKeySecret(secret) : false
  const boundModels = modelsQuery.data?.models ?? []
  const editorModels = useMemo(
    () => mergeCatalogModels(catalogQuery.data?.models ?? [], boundModels),
    [boundModels, catalogQuery.data?.models],
  )
  const savedModelIds = useMemo(() => boundModels.map((model) => model.id), [boundModels])
  const selectedModelIds = draftModelIds ?? new Set(savedModelIds)
  const modelsChanged = !sameModelIds(selectedModelIds, savedModelIds)
  const previousVersions = secret ? getActivePreviousVersions(secret) : []
  const testableModels = boundModels.filter((model) => Boolean(model.slug))
  const activeTestModel =
    testableModels.find((model) => model.id === selectedTestModelId) ?? testableModels[0]
  const baseUrl = gateway.data?.base_url

  useEffect(() => {
    cachedSecretRef.current = null
    setDraftModelIds(null)
    setSelectedTestModelId(null)
    setTestPrompt(t("models.dialog.testDefaultPrompt"))
    return () => {
      cachedSecretRef.current = null
    }
  }, [keyId, t])

  function clearPlaintext() {
    cachedSecretRef.current = null
  }

  async function resolveApiKey(): Promise<string> {
    const cached = cachedSecretRef.current
    if (cached) return cached
    let revealed: { value: string }
    try {
      revealed = await revealSecretValue(projectId, keyId)
    } catch {
      throw new Error(t("models.keys.revealError"))
    }
    if (!revealed.value) throw new Error(t("models.keys.revealError"))
    cachedSecretRef.current = revealed.value
    return revealed.value
  }

  async function copySecret() {
    try {
      const value = await resolveApiKey()
      await navigator.clipboard.writeText(value)
      cachedSecretRef.current = null
      showSuccess(t("common.messages.copied"))
    } catch (error) {
      showError(errorMessage(error, t("models.keys.revealError")))
    }
  }

  async function copyBaseUrl() {
    if (!baseUrl) return
    try {
      await navigator.clipboard.writeText(baseUrl)
      showSuccess(t("common.messages.copied"))
    } catch {
      showError(t("common.messages.copyFailed"))
    }
  }

  async function saveModels() {
    if (!modelsChanged || selectedModelIds.size === 0 || setModels.isPending) return
    try {
      await setModels.mutateAsync([...selectedModelIds])
      setDraftModelIds(null)
      showSuccess(t("models.keys.modelsSaved"))
    } catch (error) {
      showError(errorMessage(error, t("models.keys.modelsSaveError")))
    }
  }

  async function deleteKey() {
    if (!secret || deleteSecret.isPending) return
    const confirmed = await confirm({
      title: t("models.keys.deleteTitle"),
      description: t("models.keys.deleteDescription"),
      strongConfirmValue: secret.name,
      confirmText: t("models.keys.deleteButton"),
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
      await deleteSecret.mutateAsync()
      clearPlaintext()
      showSuccess(t("models.keys.deleteSuccess"))
      onClose()
    } catch (error) {
      showError(errorMessage(error, t("models.keys.deleteError")))
    }
  }

  if (secretQuery.isPending) {
    return <p role="status" className="p-6 text-sm text-muted-foreground">{t("common.loading")}</p>
  }

  if (secretQuery.isError || !secret || !isKey) {
    return (
      <p role="alert" className="p-6 text-sm text-destructive">{t("models.keys.notFound")}</p>
    )
  }

  const modelsLoading = modelsQuery.isPending || catalogQuery.isPending

  return (
    <PageStagger className="flex flex-col gap-6">
      <SlideIn className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="min-w-0 truncate text-2xl font-semibold tracking-tight" title={secret.name}>
          {secret.name}
        </h2>
        <Link
          className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          to={`/projects/${projectId}?tab=secrets&secret=${encodeURIComponent(keyId)}`}
        >
          {t("models.keys.openInSecrets")}
          <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      </SlideIn>

      <SlideIn>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-base font-semibold leading-none">{t("models.dialog.apiKey")}</p>
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={maskedKey}
                    aria-label={t("models.dialog.apiKey")}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-9 min-w-0 flex-1 cursor-text rounded-md border-0 bg-secondary px-2.5 font-mono text-xs text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    aria-label={t("models.dialog.copyKey")}
                    onClick={() => void copySecret()}
                  >
                    <Copy className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-base font-semibold leading-none">{t("models.dialog.baseUrl")}</p>
                {baseUrl ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={baseUrl}
                      aria-label={t("models.dialog.baseUrl")}
                      spellCheck={false}
                      className="h-9 min-w-0 flex-1 cursor-text rounded-md border-0 bg-secondary px-2.5 font-mono text-xs text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      aria-label={t("models.dialog.copyUrl")}
                      onClick={() => void copyBaseUrl()}
                    >
                      <Copy className="size-4" aria-hidden />
                    </Button>
                  </div>
                ) : gateway.isPending ? (
                  <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2" role="alert">
                    <p className="text-sm text-destructive">{t("models.dialog.gatewayUnavailable")}</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => void gateway.refetch()}>
                      {t("models.retry")}
                    </Button>
                  </div>
                )}
              </div>
            </div>
            {previousVersions.length > 0 ? (
              <div>
                <p className="text-sm font-medium">{t("models.keys.previousTitle")}</p>
                {previousVersions.map((version) => (
                  <PreviousKeyRow
                    key={version.version_no}
                    projectId={projectId}
                    secretId={keyId}
                    secretName={secret.name}
                    version={version}
                  />
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </SlideIn>

      <SlideIn>
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("models.keys.allowedModels")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {modelsLoading ? (
              <p role="status" className="px-6 pb-6 text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : modelsQuery.isError ? (
              <div role="alert" className="flex flex-col items-start gap-3 px-6 pb-6">
                <p className="text-sm text-destructive">{t("models.keys.modelsLoadError")}</p>
                <Button type="button" variant="outline" onClick={() => void modelsQuery.refetch()}>
                  {t("models.retry")}
                </Button>
              </div>
            ) : (
              <ModelsTable
                models={editorModels}
                filterable
                layout="auto"
                maxHeightClassName="max-h-[28rem]"
                selection={{ selectedIds: selectedModelIds, onChange: setDraftModelIds }}
              />
            )}
          </CardContent>
          {modelsLoading || modelsQuery.isError ? null : (
            <CardFooter className="flex-row flex-wrap items-center gap-3 border-t border-border pt-4">
              {selectedModelIds.size === 0 ? (
                <p className="text-sm text-muted-foreground">{t("models.keys.modelsRequired")}</p>
              ) : null}
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
            </CardFooter>
          )}
        </Card>
      </SlideIn>

      <SlideIn>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("models.keys.quickstartTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-8 md:grid-cols-2">
            <div className="h-full min-h-0 min-w-0 space-y-6">
              {activeTestModel ? (
                <LlmKeyTestPanel
                  key={keyId}
                  baseUrl={baseUrl}
                  models={testableModels}
                  selectedModel={activeTestModel}
                  onSelectModel={setSelectedTestModelId}
                  prompt={testPrompt}
                  onPromptChange={setTestPrompt}
                  resolveApiKey={resolveApiKey}
                />
              ) : null}
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
          </CardContent>
        </Card>
      </SlideIn>

      <SlideIn>
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border">
            <CardTitle className="text-xl">{t("projects.settings.dangerTitle")}</CardTitle>
          </CardHeader>
          <CardFooter className="pt-6">
            <Button
              type="button"
              variant="delete"
              disabled={deleteSecret.isPending}
              onClick={() => void deleteKey()}
            >
              {deleteSecret.isPending ? t("common.deleting") : t("models.keys.deleteButton")}
            </Button>
          </CardFooter>
        </Card>
      </SlideIn>
    </PageStagger>
  )
}
