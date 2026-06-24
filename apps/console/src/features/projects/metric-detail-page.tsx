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
import { PageStagger, SlideIn, StaggerGroup } from "@/components/motion/page-entrance"

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
      <PageStagger className="flex flex-col gap-4">
        <SlideIn>
          <p className="text-sm text-destructive">{t("metrics.unsupported")}</p>
        </SlideIn>
        <SlideIn>
          <Button variant="outline" onClick={() => navigate(`/projects/${id}?tab=overview`)}>
            {t("metrics.backToOverview")}
          </Button>
        </SlideIn>
      </PageStagger>
    )
  }

  const meta = DETAIL_METRIC_META[metric]
  const metricSeries = metricQuery.data?.points ?? []
  const metricUnit = metricQuery.data?.unit
  const resourceSeriesForChart = useMemo(() => {
    const byResource = metricQuery.data?.byResource
    if (!byResource?.length) return undefined
    const databases = dbData?.databases ?? []
    const nameById = new Map(databases.map((d) => [String(d.resource_id), d.name]))
    return byResource.map((entry) => ({
      resourceId: entry.resourceId,
      label: nameById.get(entry.resourceId) ?? entry.resourceId.slice(0, 8),
      points: entry.points,
    }))
  }, [metricQuery.data?.byResource, dbData?.databases])
  const latestValue = metricSeries[metricSeries.length - 1]?.value ?? 0

  return (
    <PageStagger className="flex flex-1 min-h-0 flex-col gap-5">
      <SlideIn className="flex flex-wrap items-start justify-between gap-3">
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
      </SlideIn>

      <StaggerGroup className="grid gap-4 sm:grid-cols-2">
        <SlideIn>
          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">{t("metrics.currentValue")}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {formatMetricValue(latestValue, metricUnit, metricFormatter)}
            </p>
          </div>
        </SlideIn>
        <SlideIn>
          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">{t("metrics.description")}</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground/90">{t(meta.descriptionKey)}</p>
          </div>
        </SlideIn>
      </StaggerGroup>

      {metricQuery.isLoading ? (
        <SlideIn className="flex min-h-[420px] items-center justify-center rounded-xl border border-border/70 bg-card">
          <p className="text-sm text-muted-foreground">{t("metrics.loading")}</p>
        </SlideIn>
      ) : metricQuery.isError ? (
        <SlideIn className="rounded-xl border border-border/70 bg-card p-4">
          <p className="text-sm text-destructive">{t("metrics.loadError")}</p>
        </SlideIn>
      ) : (
        <SlideIn className="min-h-0 flex-1">
          <DetailTimeseriesChart
            title={t(meta.titleKey)}
            points={metricSeries}
            resourceSeries={resourceSeriesForChart}
            formatValue={(value) => formatMetricValue(value, metricUnit, metricFormatter)}
          />
        </SlideIn>
      )}
    </PageStagger>
  )
}
