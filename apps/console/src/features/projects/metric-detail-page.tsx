import { useMemo } from "react"
import { ArrowLeft } from "lucide-react"
import { useNavigate, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { getResolvedLanguage } from "@/lib/i18n"
// import { InlineMessage } from "@/components/ui/inline-message"
// import { toErrorMessage } from "@/lib/errors"
import { DetailTimeseriesChart } from "./components/detail-timeseries-chart"
import { useDatabases, useProject, useProjectMetricTimeseries } from "./hooks"

const DETAIL_METRICS = [
  "db_size",
  "active_connections",
  "net_transmit",
  "net_receive",
] as const

type DetailMetric = (typeof DETAIL_METRICS)[number]

const DETAIL_METRIC_META: Record<DetailMetric, { titleKey: string; descriptionKey: string }> = {
  db_size: {
    titleKey: "metrics.db_size.title",
    descriptionKey: "metrics.db_size.description",
  },
  active_connections: {
    titleKey: "metrics.active_connections.title",
    descriptionKey: "metrics.active_connections.description",
  },
  net_transmit: {
    titleKey: "metrics.net_transmit.title",
    descriptionKey: "metrics.net_transmit.description",
  },
  net_receive: {
    titleKey: "metrics.net_receive.title",
    descriptionKey: "metrics.net_receive.description",
  },
}

function isDetailMetric(metric: string): metric is DetailMetric {
  return DETAIL_METRICS.includes(metric as DetailMetric)
}

function formatMetricValue(value: number, unit: string | undefined, formatter: Intl.NumberFormat): string {
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
    return `${formatter.format(value)} B/min`
  }

  if (unit === "bytes_per_hour") {
    return `${formatter.format(value)} B/h`
  }

  if (unit === "bytes_per_day") {
    return `${formatter.format(value)} B/day`
  }

  if (!unit || unit === "unknown") {
    return formatter.format(value)
  }

  return `${formatter.format(value)} ${unit}`
}

export function MetricDetailPage() {
  const { t } = useTranslation()
  const locale = getResolvedLanguage()
  const metricFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [locale],
  )
  const { id = "", metric = "" } = useParams<{ id: string; metric: string }>()
  const navigate = useNavigate()
  const isSupportedMetric = isDetailMetric(metric)
  const { data: project } = useProject(id)
  const { data: dbData } = useDatabases(id)

  const metricResourceIds = useMemo(
    () => (dbData?.databases ?? []).map((database) => String(database.resource_id)),
    [dbData?.databases],
  )
  const metricQuery = useProjectMetricTimeseries(id, metric, metricResourceIds)

  if (!isSupportedMetric) {
    return (
      <div className="flex flex-col gap-4">
        {/* <InlineMessage message="Метрика не поддерживается." /> */}
        <p className="text-sm text-destructive">{t("metrics.unsupported")}</p>
        <div>
          <Button variant="outline" onClick={() => navigate(`/projects/${id}?tab=overview`)}>
            {t("metrics.backToOverview")}
          </Button>
        </div>
      </div>
    )
  }

  const meta = DETAIL_METRIC_META[metric]
  const metricSeries = metricQuery.data?.points ?? []
  const metricUnit = metricQuery.data?.unit
  const latestValue = metricSeries[metricSeries.length - 1]?.value ?? 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">{t(meta.titleKey)}</h1>
          <p className="text-sm text-muted-foreground">{project?.name ?? t("projects.fallbackProject")}</p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => navigate(`/projects/${id}?tab=overview`)}
        >
          <ArrowLeft className="h-4 w-4" />
          {t("metrics.backToOverview")}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
          <p className="text-sm text-muted-foreground">{t("metrics.currentValue")}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {formatMetricValue(latestValue, metricUnit, metricFormatter)}
          </p>
        </div>
        <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
          <p className="text-sm text-muted-foreground">{t("metrics.description")}</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/90">{t(meta.descriptionKey)}</p>
        </div>
      </div>

      {metricQuery.isLoading ? (
        <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-border/70 bg-card">
          <p className="text-sm text-muted-foreground">{t("metrics.loading")}</p>
        </div>
      ) : metricQuery.isError ? (
        <div className="rounded-xl border border-border/70 bg-card p-4">
          {/* <InlineMessage
            message={toErrorMessage(metricQuery.error, "Не удалось загрузить данные метрики.")}
          /> */}
          <p className="text-sm text-destructive">{t("metrics.loadError")}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <DetailTimeseriesChart
            title={t(meta.titleKey)}
            points={metricSeries}
            formatValue={(value) => formatMetricValue(value, metricUnit, metricFormatter)}
          />
        </div>
      )}
    </div>
  )
}
