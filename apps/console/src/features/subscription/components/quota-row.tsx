import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@sb0rka/ui"
import { Progress, type ProgressTone } from "@/components/ui/progress"
import {
  formatQuotaPair,
  formatQuotaValue,
  localizedDescription,
  localizedName,
  relativeAge,
  windowLabelKey,
  withCredits,
  type QuotaRowView,
} from "../quota-format"
import { ResourceBreakdown } from "./resource-breakdown"

function kindHint(row: QuotaRowView, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (row.definition.kind === "snapshot") return t("subscription.kindSnapshot")
  if (row.definition.kind === "balance") return t("subscription.kindBalance")
  const window = windowLabelKey(row.definition.window)
  if (!window) return t("subscription.kindPeriodicPlain")
  return t("subscription.kindPeriodic", { window: t(`subscription.window.${window}`) })
}

function updatedLabel(
  iso: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  const age = relativeAge(iso)
  if (!age) return null
  const when = age.key === "justNow"
    ? t("subscription.ageJustNow")
    : age.key === "minutesAgo"
      ? t("subscription.ageMinutes", { count: age.count })
      : age.key === "hoursAgo"
        ? t("subscription.ageHours", { count: age.count })
        : t("subscription.ageDays", { count: age.count })
  return t("subscription.updated", { when })
}

export function QuotaRow({ row }: { row: QuotaRowView }) {
  const { t, i18n } = useTranslation()
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const credits = t("subscription.credits")
  const unit = row.usage?.unit || row.definition.unit
  const name = localizedName(row.definition, i18n.language)
  const description = localizedDescription(row.definition, i18n.language)
  const status = row.usage?.status
  const showMeter = status === "available" && row.usage?.used != null
  const resources = row.usage?.resources ?? []
  const pair = showMeter && row.usage?.used != null
    ? formatQuotaPair(row.usage.used, row.effective, unit)
    : null
  const limitLabel = withCredits(formatQuotaValue(row.effective, unit), unit, credits)
  const entitledLabel = withCredits(formatQuotaValue(row.entitled, unit), unit, credits)
  const tone: ProgressTone = row.level ?? "neutral"
  const observed = showMeter ? updatedLabel(row.usage?.observed_at, t) : null

  return (
    <div className="flex flex-col gap-2 border-t border-border py-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {description ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm font-medium">{name}</span>
              </TooltipTrigger>
              <TooltipContent>{description}</TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-sm font-medium">{name}</span>
          )}
          <span className="text-xs text-muted-foreground">{kindHint(row, t)}</span>
          {row.usage?.aggregation === "max" ? (
            <span className="text-xs text-muted-foreground">{t("subscription.peak")}</span>
          ) : null}
          {row.entitled > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="inactive" className="px-1.5">
                  {t("subscription.bonus", { value: entitledLabel })}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{t("subscription.bonusHint")}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <div className="text-sm tabular-nums">
          {status === "unavailable" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground">{t("common.notAvailable")}</span>
              </TooltipTrigger>
              <TooltipContent>{t("subscription.unavailable")}</TooltipContent>
            </Tooltip>
          ) : pair ? (
            <span>
              {t("subscription.usageOf", {
                used: withCredits(pair.used, unit, credits),
                limit: withCredits(pair.limit, unit, credits),
              })}
            </span>
          ) : (
            <span className="text-muted-foreground">{t("subscription.limit", { value: limitLabel })}</span>
          )}
          {observed ? (
            <span className="ml-2 text-xs text-muted-foreground">{observed}</span>
          ) : null}
        </div>
      </div>
      {status === "unsupported" ? (
        <p className="text-xs text-muted-foreground">{t("subscription.notMeasured")}</p>
      ) : null}
      {showMeter ? (
        <Progress
          label={name}
          max={row.effective}
          segments={[{ value: row.usage?.used ?? 0, tone }]}
        />
      ) : null}
      {resources.length > 0 ? (
        <div>
          <button
            type="button"
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={resourcesOpen}
            onClick={() => setResourcesOpen((open) => !open)}
          >
            {resourcesOpen ? t("subscription.hideResources") : t("subscription.byResource")}
          </button>
          {resourcesOpen ? <ResourceBreakdown resources={resources} unit={unit} /> : null}
        </div>
      ) : null}
    </div>
  )
}
