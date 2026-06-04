import {
  useMemo,
  useState,
} from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Tabs } from "@/components/ui/tabs"
import { ApiError } from "@/lib/api-client"
import {
  useProject,
  useDatabases,
  useSecrets,
  useCreateSecret,
  useCreateDatabase,
  useAttachResourceTag,
  useResources,
  useProjectMetricsTimeseries,
} from "./hooks"
import {
  DataExplorerTab,
  DatabasesTab,
  OverviewTab,
  type SecretRow,
  SecretsTab,
  SettingsTab,
  type DraftTag,
  type CreateDatabaseFormState,
  type CreateDatabaseFormActions,
} from "./components/project-detail-tabs"
import type { CreateSecretRequest, DatabaseResponse } from "./api"
import { parseDraftTag } from "./parse-draft-tag"
import { PageStagger } from "@/components/motion/page-entrance"
import { isProjectTab, type ProjectTab } from "./project-tabs"

export function ProjectDetailPage() {
  const { t } = useTranslation()
  const { id = "" } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get("tab")
  const activeTab: ProjectTab =
    isProjectTab(tabParam) ? tabParam : "overview"

  const { data: project, isLoading } = useProject(id)
  const { data: dbData } = useDatabases(id)
  const { data: secretsData } = useSecrets(id)
  const { data: resourcesData } = useResources(id)
  const metricResourceIds = useMemo(
    () => (dbData?.databases ?? []).map((database) => String(database.resource_id)),
    [dbData?.databases],
  )
  const { data: metricsTimeseries } = useProjectMetricsTimeseries(id, metricResourceIds)
  const createDatabase = useCreateDatabase(id)
  const createSecret = useCreateSecret(id)
  const attachResourceTag = useAttachResourceTag(id)
  const [newDatabaseName, setNewDatabaseName] = useState("")
  const [newDatabaseDescription, setNewDatabaseDescription] = useState("")
  const [newTagInput, setNewTagInput] = useState("")
  const [draftTags, setDraftTags] = useState<DraftTag[]>([])
  const [databaseError, setDatabaseError] = useState<string | null>(null)
  const [databaseSuccess, setDatabaseSuccess] = useState<string | null>(null)

  const dbCount = dbData?.databases.length ?? 0
  const secretCount = secretsData?.secrets.length ?? 0
  const databases: DatabaseResponse[] = dbData?.databases ?? []
  const resourceTimestampsById = useMemo(
    () =>
      Object.fromEntries(
        (resourcesData?.resources ?? []).map((resource) => [
          String(resource.id),
          {
            createdAt: resource.created_at,
            updatedAt: resource.updated_at,
          },
        ]),
      ),
    [resourcesData?.resources],
  )
  const secretRows: SecretRow[] = useMemo(
    () =>
      (secretsData?.secrets ?? []).map((secret) => ({
        id: secret.resource_id,
        name: secret.name,
        description: secret.description,
        tablesCount: "—",
        columnsCount: "—",
        createdAt: resourceTimestampsById[secret.resource_id]?.createdAt ?? "",
        updatedAt: resourceTimestampsById[secret.resource_id]?.updatedAt ?? "",
        revealedAt: secret.revealed_at,
      })),
    [resourceTimestampsById, secretsData?.secrets],
  )

  function openDatabaseDetails(resourceId: string) {
    navigate(`/projects/${id}/databases/${resourceId}`)
  }

  function resetCreateDatabaseForm() {
    setNewDatabaseName("")
    setNewDatabaseDescription("")
    setDraftTags([])
    setNewTagInput("")
  }

  function addDraftTag(raw?: string) {
    const source = (raw ?? newTagInput).trim()
    const parsed = parseDraftTag(source)
    if (!parsed) {
      setDatabaseError(t("common.messages.tagFormat"))
      return
    }

    const duplicate = draftTags.some(
      (tag) => tag.tag_key === parsed.tag_key && tag.tag_value === parsed.tag_value,
    )
    if (!duplicate) {
      setDraftTags((prev) => [...prev, parsed])
    }
    setDatabaseError(null)
    setNewTagInput("")
  }

  async function handleCreateDatabase() {
    if (!newDatabaseName.trim() || createDatabase.isPending) return

    setDatabaseError(null)
    setDatabaseSuccess(null)

    try {
      const created = await createDatabase.mutateAsync({
        name: newDatabaseName.trim(),
        description: newDatabaseDescription.trim() || undefined,
      })

      if (draftTags.length > 0) {
        try {
          await Promise.all(
            draftTags.map((tag) =>
              attachResourceTag.mutateAsync({
                resourceId: created.database.resource_id,
                data: tag,
              }),
            ),
          )
        } catch {
          setDatabaseSuccess(t("databases.createdPartial"))
          resetCreateDatabaseForm()
          return
        }
      }

      setDatabaseSuccess(t("databases.created"))
      resetCreateDatabaseForm()
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : t("databases.createError")
      setDatabaseError(message)
    }
  }

  async function handleCreateSecret(data: CreateSecretRequest) {
    await createSecret.mutateAsync(data)
  }

  const createDatabaseForm: CreateDatabaseFormState = {
    newDatabaseName,
    newDatabaseDescription,
    newTagInput,
    draftTags,
    databaseError,
    databaseSuccess,
    isCreatePending: createDatabase.isPending,
  }

  const createDatabaseActions: CreateDatabaseFormActions = {
    onSubmitCreateDatabase: handleCreateDatabase,
    onAddDraftTag: addDraftTag,
    onNewDatabaseNameChange: setNewDatabaseName,
    onNewDatabaseDescriptionChange: setNewDatabaseDescription,
    onNewTagInputChange: setNewTagInput,
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[500px]">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[500px]">
        <p className="text-sm text-muted-foreground">{t("projects.notFound")}</p>
      </div>
    )
  }

  return (
    <PageStagger className="flex flex-col gap-6">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setSearchParams({ tab: value })}
      >

        <OverviewTab
          dbCount={dbCount}
          secretCount={secretCount}
          metricsTimeseries={metricsTimeseries}
          onOpenDatabases={() => setSearchParams({ tab: "databases" })}
          onOpenSecrets={() => setSearchParams({ tab: "secrets" })}
          onOpenMetricDetail={(metric) => navigate(`/projects/${id}/metrics/${metric}`)}
        />
        <DatabasesTab
          projectId={id}
          databases={databases}
          resourceTimestampsById={resourceTimestampsById}
          createForm={createDatabaseForm}
          createActions={createDatabaseActions}
          onOpenDatabaseDetails={openDatabaseDetails}
        />
        <DataExplorerTab />
        <SecretsTab
          projectId={id}
          secretRows={secretRows}
          isCreateSecretPending={createSecret.isPending}
          onCreateSecret={handleCreateSecret}
        />
        <SettingsTab
          projectId={id}
          projectName={project.name}
          projectDescription={project.description ?? ""}
        />
      </Tabs>
    </PageStagger>
  )
}
