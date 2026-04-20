import {
  useMemo,
  useState,
} from "react"
import { useQueries } from "@tanstack/react-query"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { Tabs } from "@/components/ui/tabs"
import { ApiError } from "@/lib/api-client"
import {
  useProject,
  useDatabases,
  useSecrets,
  useCreateSecret,
  useProjectTableCount,
  useCreateDatabase,
  useAttachResourceTag,
} from "./hooks"
import {
  DatabasesTab,
  OverviewTab,
  type SecretRow,
  SecretsTab,
  SettingsTab,
  type DatabaseRow,
  type DraftTag,
  type CreateDatabaseFormState,
  type CreateDatabaseFormActions,
} from "./components/project-detail-tabs"
import { getDatabase } from "./api"
import type { CreateSecretRequest } from "./api"

type ProjectTab = "overview" | "databases" | "secrets" | "settings"
const validTabs = new Set<ProjectTab>([
  "overview",
  "databases",
  "secrets",
  "settings",
])

function formatDateForTable(value?: string): string {
  if (!value) return "—"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  return new Intl.DateTimeFormat("sv-SE").format(date)
}

function parseDraftTag(input: string): DraftTag | null {
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

export function ProjectDetailPage() {
  const { id = "" } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get("tab")
  const activeTab: ProjectTab =
    tabParam && validTabs.has(tabParam as ProjectTab)
      ? (tabParam as ProjectTab)
      : "overview"

  const { data: project, isLoading } = useProject(id)
  const { data: dbData } = useDatabases(id)
  const { data: secretsData } = useSecrets(id)
  const { data: tableCount } = useProjectTableCount(id)
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
  const databaseDetailsQueries = useQueries({
    queries: (dbData?.databases ?? []).map((database) => ({
      queryKey: ["projects", id, "resources", database.resource_id, "database"],
      queryFn: () => getDatabase(id, database.resource_id),
      enabled: !!id,
    })),
  })
  const databaseDetailsById = useMemo(() => {
    const details = new Map<string, Awaited<ReturnType<typeof getDatabase>>>()
    for (const query of databaseDetailsQueries) {
      if (!query.data) continue
      details.set(query.data.resource_id, query.data)
    }
    return details
  }, [databaseDetailsQueries])

  const databaseRows: DatabaseRow[] = useMemo(
    () =>
      (dbData?.databases ?? []).map((databaseFromList, index) => {
        const database = databaseDetailsById.get(databaseFromList.resource_id) ?? databaseFromList

        return {
          id: databaseFromList.resource_id,
          name: databaseFromList.name,
          description: databaseFromList.description,
          tablesCount: Math.max(databaseFromList.next_table_id - 1, 0),
          columnsCount: "—",
          syncState: database.sync_state,
          desiredState: database.desired_state,
          createdAt: project?.created_at ?? "",
          updatedAt: project?.updated_at ?? "",
          isHighlighted: index === 0,
        }
      }),
    [databaseDetailsById, dbData?.databases, project?.created_at, project?.updated_at],
  )
  const secretRows: SecretRow[] = useMemo(
    () =>
      (secretsData?.secrets ?? []).map((secret) => ({
        id: secret.resource_id,
        name: secret.name,
        description: secret.description,
        tablesCount: "—",
        columnsCount: "—",
        createdAt: formatDateForTable(project?.created_at),
        updatedAt: formatDateForTable(secret.revealed_at),
        revealedAt: secret.revealed_at,
      })),
    [project?.created_at, secretsData?.secrets],
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

  function addDraftTag() {
    const parsed = parseDraftTag(newTagInput)
    if (!parsed) {
      setDatabaseError("Тег должен быть в формате key:value")
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
          setDatabaseSuccess("База данных создана, но не все теги удалось добавить")
          resetCreateDatabaseForm()
          return
        }
      }

      setDatabaseSuccess("База данных успешно создана")
      resetCreateDatabaseForm()
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Не удалось создать базу данных"
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
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[500px]">
        <p className="text-sm text-muted-foreground">Проект не найден</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">

      <Tabs
        value={activeTab}
        onValueChange={(value) => setSearchParams({ tab: value })}
      >
        {/* <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="overview" className="w-[115px]">
              Обзор
            </TabsTrigger>
            <TabsTrigger value="databases">Базы данных</TabsTrigger>
            <TabsTrigger value="secrets" className="w-[115px]">
              Секреты
            </TabsTrigger>
          </TabsList>
          <Button
            variant={activeTab === "settings" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setSearchParams({ tab: "settings" })}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div> */}

        <OverviewTab dbCount={dbCount} tableCount={tableCount} />
        <DatabasesTab
          databaseRows={databaseRows}
          createForm={createDatabaseForm}
          createActions={createDatabaseActions}
          onOpenDatabaseDetails={openDatabaseDetails}
        />
        <SecretsTab
          projectId={id}
          secretRows={secretRows}
          isCreateSecretPending={createSecret.isPending}
          onCreateSecret={handleCreateSecret}
        />
        <SettingsTab
          projectId={id}
          projectName={project.name}
          createdAt={project.created_at}
        />
      </Tabs>
    </div>
  )
}
