import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react"
import { Database, HardDrive, Plus, Table2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"
import { ApiError } from "@/lib/api-client"
import type { CreateSecretRequest } from "../api"

export interface DraftTag {
  tag_key: string
  tag_value: string
}

export interface DatabaseRow {
  id: string
  name: string
  description?: string
  tablesCount: number
  columnsCount: string
  createdAt: string
  updatedAt: string
  isHighlighted: boolean
}

export interface SecretRow {
  id: string
  name: string
  description?: string
  tablesCount: string
  columnsCount: string
  createdAt: string
  updatedAt: string
  isHighlighted: boolean
}

interface MetricCardProps {
  title: string
  value: string | number
  description?: string
  icon: ReactNode
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

interface OverviewTabProps {
  dbCount: number
  tableCount?: number
}

export function OverviewTab({ dbCount, tableCount }: OverviewTabProps) {
  return (
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
  )
}

interface DatabasesTabProps {
  databaseRows: DatabaseRow[]
  newDatabaseName: string
  newDatabaseDescription: string
  newTagInput: string
  draftTags: DraftTag[]
  databaseError: string | null
  databaseSuccess: string | null
  isCreatePending: boolean
  onOpenDatabaseDetails: (resourceId: string) => void
  onSubmitCreateDatabase: (e: FormEvent) => Promise<void>
  onAddDraftTag: () => void
  onNewDatabaseNameChange: (value: string) => void
  onNewDatabaseDescriptionChange: (value: string) => void
  onNewTagInputChange: (value: string) => void
}

export function DatabasesTab({
  databaseRows,
  newDatabaseName,
  newDatabaseDescription,
  newTagInput,
  draftTags,
  databaseError,
  databaseSuccess,
  isCreatePending,
  onOpenDatabaseDetails,
  onSubmitCreateDatabase,
  onAddDraftTag,
  onNewDatabaseNameChange,
  onNewDatabaseDescriptionChange,
  onNewTagInputChange,
}: DatabasesTabProps) {
  const dbNameInputRef = useRef<HTMLInputElement>(null)

  function handleRowKeyDown(e: KeyboardEvent<HTMLDivElement>, resourceId: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onOpenDatabaseDetails(resourceId)
    }
  }

  function handleTagInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      onAddDraftTag()
    }
  }

  return (
    <TabsContent value="databases" className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">База данных</h2>
          <p className="text-sm text-muted-foreground">
            Управляйте данными с легкостью: создавайте, храните и обрабатывайте их.
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
            <div className="flex h-12 items-center justify-end">Дата создания</div>
            <div className="flex h-12 items-center justify-end">Дата изменения</div>
          </div>

          {databaseRows.length === 0 ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">Нет баз данных</div>
          ) : (
            databaseRows.map((row, index) => (
              <div
                key={row.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenDatabaseDetails(row.id)}
                onKeyDown={(e) => handleRowKeyDown(e, row.id)}
                className={`grid grid-cols-[2.4fr_1fr_1fr_1.3fr_1.3fr] px-4 ${
                  row.isHighlighted ? "bg-muted/70" : ""
                } ${index < databaseRows.length - 1 ? "border-b border-border" : ""} cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none`}
              >
                <div className="flex min-h-20 flex-col justify-center py-3">
                  <p className="text-sm font-medium text-foreground">{row.name}</p>
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
        <form onSubmit={onSubmitCreateDatabase}>
          <CardContent className="space-y-4 pb-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-db-name">Название</Label>
                <Input
                  id="new-db-name"
                  placeholder="Введите название базы данных"
                  value={newDatabaseName}
                  onChange={(e) => onNewDatabaseNameChange(e.target.value)}
                  ref={dbNameInputRef}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-db-description">Описание</Label>
                <Input
                  id="new-db-description"
                  placeholder="Добавьте описание базы данных"
                  value={newDatabaseDescription}
                  onChange={(e) => onNewDatabaseDescriptionChange(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Теги</Label>
              <div className="flex flex-wrap items-center gap-2 pb-1">
                {draftTags.map((tag) => (
                  <Badge key={`${tag.tag_key}:${tag.tag_value}`}>{`${tag.tag_key}:${tag.tag_value}`}</Badge>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={onAddDraftTag}>
                  + добавить тег
                </Button>
              </div>
              <Input
                placeholder="Например: env:production"
                value={newTagInput}
                onChange={(e) => onNewTagInputChange(e.target.value)}
                onKeyDown={handleTagInputKeyDown}
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
            <Button type="submit" disabled={!newDatabaseName.trim() || isCreatePending}>
              {isCreatePending ? "Создание…" : "Создать"}
            </Button>
          </div>
        </form>
      </Card>
    </TabsContent>
  )
}

interface SecretsTabProps {
  secretRows: SecretRow[]
  isCreateSecretPending: boolean
  onCreateSecret: (data: CreateSecretRequest) => Promise<void>
}

export function SecretsTab({
  secretRows,
  isCreateSecretPending,
  onCreateSecret,
}: SecretsTabProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newSecretName, setNewSecretName] = useState("")
  const [newSecretDescription, setNewSecretDescription] = useState("")
  const [newSecretValue, setNewSecretValue] = useState("")
  const [createSecretError, setCreateSecretError] = useState<string | null>(null)

  function resetCreateSecretForm() {
    setNewSecretName("")
    setNewSecretDescription("")
    setNewSecretValue("")
    setCreateSecretError(null)
  }

  function handleCreateDialogOpenChange(next: boolean) {
    if (!next) {
      resetCreateSecretForm()
    }
    setIsCreateDialogOpen(next)
  }

  async function handleCreateSecretSubmit(e: FormEvent) {
    e.preventDefault()
    if (!newSecretName.trim() || !newSecretValue.trim() || isCreateSecretPending) {
      return
    }

    setCreateSecretError(null)

    try {
      await onCreateSecret({
        name: newSecretName.trim(),
        description: newSecretDescription.trim() || undefined,
        secret_value: newSecretValue.trim(),
      })
      handleCreateDialogOpenChange(false)
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Не удалось создать секрет"
      setCreateSecretError(message)
    }
  }

  return (
    <TabsContent value="secrets" className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">Секреты</h2>
          <p className="text-sm text-muted-foreground opacity-30">
            Управляйте данными с легкостью: создавайте, храните и обрабатывайте их.
          </p>
        </div>
        <Button className="opacity-90" onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Создать секрет
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="pb-6 px-6">
          <div className="opacity-30">
            <div className="grid grid-cols-[2.4fr_1fr_1fr_1.3fr_1.3fr] border-b border-border text-sm font-medium text-muted-foreground">
              <div className="flex h-12 items-center px-4">Название</div>
              <div className="flex h-12 items-center px-4">Таблицы</div>
              <div className="flex h-12 items-center px-4">Колонки</div>
              <div className="flex h-12 items-center justify-end px-4">Дата создания</div>
              <div className="flex h-12 items-center justify-end px-4">Дата изменения</div>
            </div>

            {secretRows.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">Нет секретов</div>
            ) : (
              secretRows.map((row, index) => (
                <div
                  key={row.id}
                  className={`grid grid-cols-[2.4fr_1fr_1fr_1.3fr_1.3fr] ${
                    row.isHighlighted ? "bg-muted/70" : ""
                  } ${index < secretRows.length - 1 ? "border-b border-border" : ""}`}
                >
                  <div className="flex min-h-20 flex-col justify-center px-4 py-3">
                    <p className="text-sm font-medium text-foreground">{row.name}</p>
                    {row.description ? (
                      <p className="truncate text-sm text-muted-foreground">
                        {row.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex min-h-20 items-center px-4 py-3 text-sm text-foreground">
                    {row.tablesCount}
                  </div>
                  <div className="flex min-h-20 items-center px-4 py-3 text-sm text-foreground">
                    {row.columnsCount}
                  </div>
                  <div className="flex min-h-20 items-center justify-end px-4 py-3 text-sm text-foreground">
                    {row.createdAt}
                  </div>
                  <div className="flex min-h-20 items-center justify-end px-4 py-3 text-sm text-foreground">
                    {row.updatedAt}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogOpenChange}>
        <DialogContent>
          <form onSubmit={handleCreateSecretSubmit} autoComplete="off">
            <DialogHeader>
              <DialogTitle>Создать секрет</DialogTitle>
              <DialogDescription>
                Добавьте защищенное значение для использования в проекте.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 px-6 pb-6">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-secret-name">Название</Label>
                <Input
                  id="new-secret-name"
                  name="secret-name"
                  autoComplete="off"
                  placeholder="Например: STRIPE_KEY"
                  value={newSecretName}
                  onChange={(e) => setNewSecretName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-secret-description">Описание</Label>
                <Input
                  id="new-secret-description"
                  name="secret-description"
                  autoComplete="off"
                  placeholder="Опишите назначение секрета"
                  value={newSecretDescription}
                  onChange={(e) => setNewSecretDescription(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-secret-value">Значение</Label>
                <Input
                  id="new-secret-value"
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
                  placeholder="Введите значение секрета"
                  value={newSecretValue}
                  onChange={(e) => setNewSecretValue(e.target.value)}
                />
              </div>
              {createSecretError ? (
                <p className="text-sm text-destructive">{createSecretError}</p>
              ) : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleCreateDialogOpenChange(false)}
                disabled={isCreateSecretPending}
              >
                Отменить
              </Button>
              <Button
                type="submit"
                disabled={
                  !newSecretName.trim() ||
                  !newSecretValue.trim() ||
                  isCreateSecretPending
                }
              >
                {isCreateSecretPending ? "Создание…" : "Создать секрет"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </TabsContent>
  )
}

export function SettingsTab() {
  return (
    <TabsContent value="settings">
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Настройки проекта будут доступны в следующей версии.
          </p>
        </CardContent>
      </Card>
    </TabsContent>
  )
}
