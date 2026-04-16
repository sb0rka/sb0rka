import {
  useMemo,
  useState,
  type FormEvent,
} from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { Settings } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
} from "./components/project-detail-tabs"
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
  const databaseRows: DatabaseRow[] = useMemo(
    () =>
      (dbData?.databases ?? []).map((database, index) => ({
        id: database.resource_id,
        name: database.name,
        description: database.description,
        tablesCount: Math.max(database.next_table_id - 1, 0),
        columnsCount: "—",
        createdAt: formatDateForTable(project?.created_at),
        updatedAt: formatDateForTable(project?.updated_at),
        isHighlighted: index === 0,
      })),
    [dbData?.databases, project?.created_at, project?.updated_at],
  )
  const secretRows: SecretRow[] = useMemo(
    () =>
      (secretsData?.secrets ?? []).map((secret, index) => ({
        id: secret.resource_id,
        name: secret.name,
        description: secret.description,
        tablesCount: "—",
        columnsCount: "—",
        createdAt: formatDateForTable(project?.created_at),
        updatedAt: formatDateForTable(secret.revealed_at),
        revealedAt: secret.revealed_at,
        isHighlighted: index === 0,
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

  async function handleCreateDatabase(e: FormEvent) {
    e.preventDefault()
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
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold text-foreground">
          {project.name}
        </h1>
        <Badge variant={project.is_active ? "active-solid" : "inactive"}>
          {project.is_active ? "Активен" : "Неактивен"}
        </Badge>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setSearchParams({ tab: value })}
      >
        <div className="flex items-center justify-between">
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
        </div>

        <OverviewTab dbCount={dbCount} tableCount={tableCount} />
        <DatabasesTab
          databaseRows={databaseRows}
          newDatabaseName={newDatabaseName}
          newDatabaseDescription={newDatabaseDescription}
          newTagInput={newTagInput}
          draftTags={draftTags}
          databaseError={databaseError}
          databaseSuccess={databaseSuccess}
          isCreatePending={createDatabase.isPending}
          onOpenDatabaseDetails={openDatabaseDetails}
          onSubmitCreateDatabase={handleCreateDatabase}
          onAddDraftTag={addDraftTag}
          onNewDatabaseNameChange={setNewDatabaseName}
          onNewDatabaseDescriptionChange={setNewDatabaseDescription}
          onNewTagInputChange={setNewTagInput}
        />
        <SecretsTab
          projectId={id}
          secretRows={secretRows}
          isCreateSecretPending={createSecret.isPending}
          onCreateSecret={handleCreateSecret}
        />
        <SettingsTab />
      </Tabs>
    </div>
  )
}
