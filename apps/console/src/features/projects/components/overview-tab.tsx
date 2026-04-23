import { useMemo, type KeyboardEvent, type ReactNode } from "react"
import { Database, HardDrive, KeyRound } from "lucide-react"
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
  timestamp: string
  value: number
}

interface ChartCardProps {
  title: string
  value: string | number
  description: string
  bars: ChartBar[]
}

const MAX_CHART_POINTS = 96

function getMedian(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

function downsampleBars(bars: ChartBar[]): ChartBar[] {
  if (bars.length <= MAX_CHART_POINTS) return bars

  const bucketSize = Math.ceil(bars.length / MAX_CHART_POINTS)
  const sampled: ChartBar[] = []

  for (let index = 0; index < bars.length; index += bucketSize) {
    const bucket = bars.slice(index, index + bucketSize)
    if (bucket.length === 0) continue
    const avgValue = bucket.reduce((sum, point) => sum + point.value, 0) / bucket.length
    const tail = bucket[bucket.length - 1]
    sampled.push({
      label: tail.label,
      timestamp: tail.timestamp,
      value: avgValue,
    })
  }

  if (sampled[0]?.timestamp !== bars[0]?.timestamp) {
    sampled.unshift(bars[0])
  }
  if (
    sampled[sampled.length - 1]?.timestamp !== bars[bars.length - 1]?.timestamp &&
    bars[bars.length - 1]
  ) {
    sampled.push(bars[bars.length - 1]!)
  }

  return sampled
}

function normalizeFirstPointOutlier(values: number[]): number[] {
  if (values.length < 4) return values

  const diffs = values.slice(1).map((value, index) => Math.abs(value - values[index]))
  const medianDiff = getMedian(diffs)
  if (medianDiff === 0) return values

  const firstDiff = Math.abs(values[0] - values[1])
  const range = Math.max(...values) - Math.min(...values)
  const isOutlier = firstDiff > medianDiff * 8 && firstDiff > range * 0.35

  if (!isOutlier) return values

  return [values[1], ...values.slice(1)]
}

function getPaddedDomain(values: number[]): { min: number; max: number } {
  if (values.length === 0) {
    return { min: 0, max: 1 }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const q1 = sorted[Math.floor((sorted.length - 1) * 0.25)] ?? sorted[0]
  const q3 = sorted[Math.floor((sorted.length - 1) * 0.75)] ?? sorted[sorted.length - 1]
  const iqr = q3 - q1
  const lowerFence = q1 - iqr * 1.5
  const upperFence = q3 + iqr * 1.5
  const trimmed = sorted.filter((value) => value >= lowerFence && value <= upperFence)
  const domainValues = trimmed.length > 1 ? trimmed : sorted
  const min = domainValues[0]
  const max = domainValues[domainValues.length - 1]
  const range = max - min || Math.max(Math.abs(max), 1)
  const padding = range * 0.12

  return {
    min: min - padding,
    max: max + padding,
  }
}

function formatRangeLabel(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return "—"

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function ChartCard({ title, value, description, bars }: ChartCardProps) {
  const sampledBars = downsampleBars(bars)
  const hasData = sampledBars.some((point) => point.value > 0)
  const displayValues = normalizeFirstPointOutlier(sampledBars.map((point) => point.value))
  const domain = getPaddedDomain(displayValues)
  const valueRange = Math.max(domain.max - domain.min, 1)
  const xStep = sampledBars.length > 1 ? 100 / (sampledBars.length - 1) : 100
  const points = sampledBars.map((point, index) => {
    const x = Math.round(index * xStep * 100) / 100
    const y = Math.round((34 - ((displayValues[index] - domain.min) / valueRange) * 30) * 100) / 100
    return { ...point, x, y }
  })
  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ")

  return (
    <Card className="flex-1">
      <CardHeader className="gap-1.5 pb-3 pt-6 px-6">
        <p className="text-sm font-normal tracking-tight text-muted-foreground">{title}</p>
        <p className="text-4xl font-bold tracking-tight">{value}</p>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <p className="text-xs text-muted-foreground">{description}</p>
        <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-3">
          <svg viewBox="0 0 100 36" className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label={`${title} sparkline`}>
            <line x1="0" y1="34" x2="100" y2="34" className="stroke-border/80" strokeWidth="1" />
            <path
              d={linePath}
              className={hasData ? "stroke-primary" : "stroke-muted-foreground/40"}
              fill="none"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatRangeLabel(sampledBars[0]?.timestamp ?? "")}</span>
            <span>{formatRangeLabel(sampledBars[sampledBars.length - 1]?.timestamp ?? "")}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const FALLBACK_BARS: ChartBar[] = [
  { label: "—", timestamp: "", value: 0 },
  { label: "—", timestamp: "", value: 0 },
  { label: "—", timestamp: "", value: 0 },
  { label: "—", timestamp: "", value: 0 },
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

  return series.map((point) => ({
    label: formatPointLabel(point.timestamp),
    timestamp: point.timestamp,
    value: Math.max(point.value, 0),
  }))
}

interface OverviewTabProps {
  dbCount: number
  secretCount?: number
  metricsTimeseries?: ProjectMetricsTimeseries
  onOpenDatabases?: () => void
  onOpenSecrets?: () => void
}

export function OverviewTab({
  dbCount,
  secretCount,
  metricsTimeseries,
  onOpenDatabases,
  onOpenSecrets,
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
      const lastValue = series[series.length - 1]?.value ?? 0

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
  const diskUsageValue = diskUsageSeries[diskUsageSeries.length - 1]?.value ?? 0

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
          title="Секреты"
          value={secretCount ?? 0}
          icon={<KeyRound className="h-4 w-4" />}
          onClick={onOpenSecrets}
        />
        <MetricCard
          title="Диск"
          value={formatDiskUsagePercent(diskUsageValue, diskUsageUnit)}
          description={
            diskUsageSeries.length > 0
              ? ""
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
