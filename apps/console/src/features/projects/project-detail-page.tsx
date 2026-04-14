import { useParams } from "react-router-dom"
import { Database, Table2, HardDrive, Settings } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useProject, useDatabases, useSecrets, useProjectTableCount } from "./hooks"

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

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const projectId = Number(id)

  const { data: project, isLoading } = useProject(projectId)
  const { data: dbData } = useDatabases(projectId)
  const { data: secretsData } = useSecrets(projectId)
  const { data: tableCount } = useProjectTableCount(projectId)

  const dbCount = dbData?.databases.length ?? 0
  const secretCount = secretsData?.secrets.length ?? 0

  console.log(project)

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

      <Tabs defaultValue="overview">
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
          <Button variant="ghost" size="icon">
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

        <TabsContent value="databases">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                {dbCount > 0
                  ? `${dbCount} баз данных в проекте`
                  : "Нет баз данных"}
              </p>
            </CardContent>
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
      </Tabs>
    </div>
  )
}
