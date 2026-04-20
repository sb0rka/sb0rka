import type { KeyboardEvent, ReactNode } from "react"
import { Database, HardDrive, Table2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs"

interface MetricCardProps {
  title: string
  value: string | number
  description?: string
  icon: ReactNode
  onClick?: () => void
}

function MetricCard({ title, value, description, icon, onClick }: MetricCardProps) {
  const isClickable = Boolean(onClick)

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!onClick) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onClick()
    }
  }

  return (
    <Card
      className={`flex-1 ${isClickable ? "cursor-pointer transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" : ""}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <CardHeader className="pb-3 pt-6 px-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium tracking-tight">{title}</CardTitle>
          <span className="opacity-50">{icon}</span>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <div className="flex flex-col gap-1">
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
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
        <p className="text-sm font-normal tracking-tight text-muted-foreground">{title}</p>
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
              <div className="w-full rounded bg-card-foreground" style={{ height: `${bar.height}%` }} />
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
  onOpenDatabases?: () => void
}

export function OverviewTab({ dbCount, tableCount, onOpenDatabases }: OverviewTabProps) {
  return (
    <TabsContent value="overview" className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          title="Базы данных"
          value={dbCount}
          icon={<Database className="h-4 w-4" />}
          onClick={onOpenDatabases}
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
