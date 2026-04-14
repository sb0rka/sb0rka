import { useMemo, useRef, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { Database, Table2, HardDrive, Settings, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ApiError } from "@/lib/api-client"
import {
  useProject,
  useDatabases,
  useSecrets,
  useProjectTableCount,
  useCreateDatabase,
  useAttachResourceTag,
} from "./hooks"

type ProjectTab = "overview" | "databases" | "secrets" | "settings"
const validTabs = new Set<ProjectTab>([
  "overview",
  "databases",
  "secrets",
  "settings",
])

interface MetricCardProps {
  title: string
  value: string | number
  description?: string
  icon: React.ReactNode
}

function MetricCard({ title, value, description, icon }: MetricCardProps) {
  return (
    <Card className="flex-1">
      <CardHeader className="pb-3 pt-6 px-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium tracking-tight">
            {title}
          </CardTitle>
          <span className="opacity-50">{icon}</span>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <div className="flex flex-col gap-1">
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface ChartBar {
  label: string
  height: number
}

interface ChartCardProps {
  title: string
  value: string | number
  description: string
  bars: ChartBar[]
}

function ChartCard({ title, value, description, bars }: ChartCardProps) {
  return (
    <Card className="flex-1">
      <CardHeader className="gap-1.5 pb-3 pt-6 px-6">
        <p className="text-sm font-normal tracking-tight text-muted-foreground">
          {title}
        </p>
        <p className="text-4xl font-bold tracking-tight">{value}</p>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <p className="text-xs text-muted-foreground">{description}</p>
        <div className="mt-4 flex h-40 items-end gap-2">
          {bars.map((bar) => (
            <div
              key={bar.label}
              className="flex flex-1 flex-col items-center justify-end gap-0.5 h-full"
            >
              <div
                className="w-full rounded bg-card-foreground"
                style={{ height: `${bar.height}%` }}
              />
              <span className="text-xs text-[#888]">{bar.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const MOCK_CHARTS: ChartCardProps[] = [
  {
    title: "Использование диска",
    value: 100,
    description: "+25% с прошлой недели",
    bars: [
      { label: "Jan", height: 70 },
      { label: "Feb", height: 60 },
      { label: "Mar", height: 100 },
      { label: "Apr", height: 47 },
    ],
  },
  {
    title: "Активные подключения",
    value: 4,
    description: "+25% с прошлой недели",
    bars: [
      { label: "Jan", height: 42 },
      { label: "Feb", height: 52 },
      { label: "Mar", height: 71 },
      { label: "Apr", height: 79 },
    ],
  },
  {
    title: "Сетевой исходящий трафик",
    value: 649,
    description: "+25% с прошлой недели",
    bars: [
      { label: "Jan", height: 57 },
      { label: "Feb", height: 75 },
      { label: "Mar", height: 24 },
      { label: "Apr", height: 52 },
    ],
  },
  {
    title: "Сетевой входящий трафик",
    value: 3,
    description: "+25% с прошлой недели",
    bars: [
      { label: "Jan", height: 32 },
      { label: "Feb", height: 68 },
      { label: "Mar", height: 57 },
      { label: "Apr", height: 71 },
    ],
  },
]

function formatDateForTable(value?: string): string {
  if (!value) return "—"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  return new Intl.DateTimeFormat("sv-SE").format(date)
}

interface DraftTag {
  tag_key: string
  tag_value: string
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
  const attachResourceTag = useAttachResourceTag(id)
  const [newDatabaseName, setNewDatabaseName] = useState("")
  const [newDatabaseDescription, setNewDatabaseDescription] = useState("")
  const [newTagInput, setNewTagInput] = useState("")
  const [draftTags, setDraftTags] = useState<DraftTag[]>([])
  const [databaseError, setDatabaseError] = useState<string | null>(null)
  const [databaseSuccess, setDatabaseSuccess] = useState<string | null>(null)
  const dbNameInputRef = useRef<HTMLInputElement>(null)

  const dbCount = dbData?.databases.length ?? 0
  const secretCount = secretsData?.secrets.length ?? 0
  const databaseRows = useMemo(
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

  function openDatabaseDetails(resourceId: string) {
    navigate(`/projects/${id}/databases/${resourceId}`)
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

  async function handleCreateDatabase(e: React.FormEvent) {
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
          setNewDatabaseName("")
          setNewDatabaseDescription("")
          setDraftTags([])
          setNewTagInput("")
          return
        }
      }

      setDatabaseSuccess("База данных успешно создана")
      setNewDatabaseName("")
      setNewDatabaseDescription("")
      setDraftTags([])
      setNewTagInput("")
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Не удалось создать базу данных"
      setDatabaseError(message)
    }
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

        <TabsContent value="overview" className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              title="Базы данных"
              value={dbCount}
              icon={<Database className="h-4 w-4" />}
            />
            <MetricCard
              title="Таблицы"
              value={tableCount ?? 0}
              description="+5% с прошлого месяца"
              icon={<Table2 className="h-4 w-4" />}
            />
            <MetricCard
              title="Диск"
              value="12 %"
              description="+19% с прошлого месяца"
              icon={<HardDrive className="h-4 w-4" />}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MOCK_CHARTS.map((chart) => (
              <ChartCard key={chart.title} {...chart} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="databases" className="flex flex-col gap-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-semibold tracking-tight">
                База данных
              </h2>
              <p className="text-sm text-muted-foreground">
                Управляйте данными с легкостью: создавайте, храните и
                обрабатывайте их.
              </p>
            </div>
            <Button onClick={() => dbNameInputRef.current?.focus()}>
              <Plus className="mr-2 h-4 w-4" />
              Создать базу данных
            </Button>
          </div>

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="grid grid-cols-[2.4fr_1fr_1fr_1.3fr_1.3fr] border-b border-border px-4 text-sm font-medium text-muted-foreground">
                <div className="flex h-12 items-center">Название</div>
                <div className="flex h-12 items-center">Таблицы</div>
                <div className="flex h-12 items-center">Колонки</div>
                <div className="flex h-12 items-center justify-end">
                  Дата создания
                </div>
                <div className="flex h-12 items-center justify-end">
                  Дата изменения
                </div>
              </div>

              {databaseRows.length === 0 ? (
                <div className="px-4 py-8 text-sm text-muted-foreground">
                  Нет баз данных
                </div>
              ) : (
                databaseRows.map((row, index) => (
                  <div
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openDatabaseDetails(row.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        openDatabaseDetails(row.id)
                      }
                    }}
                    className={`grid grid-cols-[2.4fr_1fr_1fr_1.3fr_1.3fr] px-4 ${
                      row.isHighlighted ? "bg-muted/70" : ""
                    } ${index < databaseRows.length - 1 ? "border-b border-border" : ""} cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none`}
                  >
                    <div className="flex min-h-20 flex-col justify-center py-3">
                      <p className="text-sm font-medium text-foreground">
                        {row.name}
                      </p>
                      {row.description ? (
                        <p className="truncate text-sm text-muted-foreground">
                          {row.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex min-h-20 items-center py-3 text-sm text-foreground">
                      {row.tablesCount}
                    </div>
                    <div className="flex min-h-20 items-center py-3 text-sm text-foreground">
                      {row.columnsCount}
                    </div>
                    <div className="flex min-h-20 items-center justify-end py-3 text-sm text-foreground">
                      {row.createdAt}
                    </div>
                    <div className="flex min-h-20 items-center justify-end py-3 text-sm text-foreground">
                      {row.updatedAt}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl font-semibold tracking-tight">
                Создать новую базу данных
              </CardTitle>
            </CardHeader>
            <form onSubmit={handleCreateDatabase}>
              <CardContent className="space-y-4 pb-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new-db-name">Название</Label>
                    <Input
                      id="new-db-name"
                      placeholder="Введите название базы данных"
                      value={newDatabaseName}
                      onChange={(e) => setNewDatabaseName(e.target.value)}
                      ref={dbNameInputRef}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new-db-description">Описание</Label>
                    <Input
                      id="new-db-description"
                      placeholder="Добавьте описание базы данных"
                      value={newDatabaseDescription}
                      onChange={(e) => setNewDatabaseDescription(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Теги</Label>
                  <div className="flex flex-wrap items-center gap-2 pb-1">
                    {draftTags.map((tag) => (
                      <Badge
                        key={`${tag.tag_key}:${tag.tag_value}`}
                      >{`${tag.tag_key}:${tag.tag_value}`}</Badge>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addDraftTag}
                    >
                      + добавить тег
                    </Button>
                  </div>
                  <Input
                    placeholder="Например: env:production"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addDraftTag()
                      }
                    }}
                  />
                </div>
                {databaseError ? (
                  <p className="text-sm text-destructive">{databaseError}</p>
                ) : null}
                {databaseSuccess ? (
                  <p className="text-sm text-emerald-600">{databaseSuccess}</p>
                ) : null}
              </CardContent>
              <div className="border-t border-border px-6 py-6">
                <Button
                  type="submit"
                  disabled={!newDatabaseName.trim() || createDatabase.isPending}
                >
                  {createDatabase.isPending ? "Создание…" : "Создать"}
                </Button>
              </div>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="secrets">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                {secretCount > 0
                  ? `${secretCount} секретов в проекте`
                  : "Нет секретов"}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Настройки проекта будут доступны в следующей версии.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
