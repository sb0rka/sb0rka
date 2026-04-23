import { useMemo, type KeyboardEvent, type ReactNode } from "react"
import { Database, HardDrive, Table2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs"
import type { ObservabilityMetricPoint } from "../api"
import type { ProjectMetricsTimeseries } from "../hooks"

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
          {bars.map((bar, index) => (
            <div
              key={`${bar.label}-${index}`}
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

const FALLBACK_BARS: ChartBar[] = [
  { label: "—", height: 0 },
  { label: "—", height: 0 },
  { label: "—", height: 0 },
  { label: "—", height: 0 },
]

const METRIC_FORMATTER = new Intl.NumberFormat("ru-RU", {
  notation: "compact",
  maximumFractionDigits: 1,
})

function formatPointLabel(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return "—"

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function buildBarsFromSeries(series: ObservabilityMetricPoint[]): ChartBar[] {
  if (series.length === 0) return FALLBACK_BARS

  const tail = series.slice(-4)
  const maxValue = Math.max(...tail.map((point) => point.value), 1)

  return tail.map((point) => ({
    label: formatPointLabel(point.timestamp),
    height: Math.round((Math.max(point.value, 0) / maxValue) * 100),
  }))
}

interface OverviewTabProps {
  dbCount: number
  tableCount?: number
  metricsTimeseries?: ProjectMetricsTimeseries
  onOpenDatabases?: () => void
}

export function OverviewTab({
  dbCount,
  tableCount,
  metricsTimeseries,
  onOpenDatabases,
}: OverviewTabProps) {
  function formatDiskUsagePercent(value: number, unit?: string): string {
    if (unit === "ratio") {
      return `${(value * 100).toFixed(1)}%`
    }

    const normalized = value > 1 ? value : value * 100
    return `${normalized.toFixed(1)}%`
  }

  function formatMetricValue(value: number, unit?: string): string {
    if (unit === "bytes_per_second" || unit === "bytes") {
      const units = unit === "bytes_per_second"
        ? ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"]
        : ["B", "KB", "MB", "GB", "TB"]
      let normalized = value
      let index = 0

      while (normalized >= 1024 && index < units.length - 1) {
        normalized /= 1024
        index += 1
      }

      const decimals = normalized >= 100 ? 0 : normalized >= 10 ? 1 : 2
      return `${normalized.toFixed(decimals)} ${units[index]}`
    }

    if (unit === "count") {
      return Math.round(value).toString()
    }

    if (unit === "ratio" || unit === "percent") {
      return `${(value * 100).toFixed(1)}%`
    }

    if (unit === "bytes_per_minute") {
      return `${METRIC_FORMATTER.format(value)} B/min`
    }

    if (unit === "bytes_per_hour") {
      return `${METRIC_FORMATTER.format(value)} B/h`
    }

    if (unit === "bytes_per_day") {
      return `${METRIC_FORMATTER.format(value)} B/day`
    }

    if (unit === "bytes_per_second") {
      return METRIC_FORMATTER.format(value)
    }

    if (!unit || unit === "unknown") {
      return METRIC_FORMATTER.format(value)
    }

    return `${METRIC_FORMATTER.format(value)} ${unit}`
  }

  const charts = useMemo<ChartCardProps[]>(() => {
    const meta = [
      {
        metric: "db_size",
        title: "Использование диска",
      },
      {
        metric: "active_connections",
        title: "Активные подключения",
      },
      {
        metric: "net_transmit",
        title: "Сетевой исходящий трафик",
      },
      {
        metric: "net_receive",
        title: "Сетевой входящий трафик",
      },
    ] as const

    return meta.map(({ metric, title }) => {
      const series = metricsTimeseries?.[metric]?.points ?? []
      const unit = metricsTimeseries?.[metric]?.unit
      const lastValue = series.at(-1)?.value ?? 0

      return {
        title,
        value: formatMetricValue(lastValue, unit),
        description:
          series.length > 0
            ? ""
            : "Данные еще не поступили",
        bars: buildBarsFromSeries(series),
      }
    })
  }, [metricsTimeseries])

  const diskUsageSeries = metricsTimeseries?.db_size_rate?.points ?? []
  const diskUsageUnit = metricsTimeseries?.db_size_rate?.unit
  const diskUsageValue = diskUsageSeries.at(-1)?.value ?? 0

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
          icon={<Table2 className="h-4 w-4" />}
        />
        <MetricCard
          title="Диск"
          value={formatDiskUsagePercent(diskUsageValue, diskUsageUnit)}
          description={
            diskUsageSeries.length > 0
              ? "Текущее заполнение диска"
              : "Данные еще не поступили"
          }
          icon={<HardDrive className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {charts.map((chart) => (
          <ChartCard key={chart.title} {...chart} />
        ))}
      </div>
    </TabsContent>
  )
}
