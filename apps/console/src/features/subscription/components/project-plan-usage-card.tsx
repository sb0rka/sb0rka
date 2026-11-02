import { useTranslation } from "react-i18next"
import { Badge, Button, Card, cn } from "@sb0rka/ui"
import type { ProjectQuotaView } from "../hooks"
import {
  formatQuotaPair,
  formatQuotaValue,
  localizedDescription,
  localizedName,
  shortQuotaName,
  windowLabelKey,
  withCredits,
  type QuotaRowView,
} from "../quota-format"

function usageLabel(
  row: QuotaRowView,
  credits: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const unit = row.usage?.unit || row.definition.unit
  const limit = withCredits(formatQuotaValue(row.effective, unit), unit, credits)
  const status = row.usage?.status
  if (status === "unavailable") return t("common.notAvailable")
  if (status === "unsupported") return t("subscription.notMeasured")
  if (status === "available" && row.usage?.used != null) {
    const pair = formatQuotaPair(row.usage.used, row.effective, unit)
    return t("subscription.usageOf", {
      used: withCredits(pair.used, unit, credits),
      limit: withCredits(pair.limit, unit, credits),
    })
  }
  return t("subscription.limit", { value: limit })
}

function UsageDial({ ratio, nearLimit }: { ratio: number | null; nearLimit: boolean }) {
  const value = ratio == null ? 0 : Math.min(1, Math.max(0, ratio))
  const radius = 7
  const circumference = 2 * Math.PI * radius
  const filled = circumference * value
  const tone = nearLimit ? "text-[#c75a48]" : "text-emerald-500"

  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-hidden>
      <circle
        cx="10"
        cy="10"
        r={radius}
        fill="none"
        strokeWidth="2.5"
        className="stroke-muted-foreground/30"
      />
      {value > 0 ? (
        <circle
          cx="10"
          cy="10"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          transform="rotate(-90 10 10)"
          className={tone}
        />
      ) : null}
    </svg>
  )
}

function UsageMeterRow({ row }: { row: QuotaRowView }) {
  const { t, i18n } = useTranslation()
  const credits = t("subscription.credits")
  const quotaName = shortQuotaName(row, i18n.language, t, "quotaLabel")
  const window = windowLabelKey(row.definition.window)
  const name = window
    ? t("subscription.quotaWithWindow", {
        name: quotaName,
        window: t(`subscription.window.${window}`),
      })
    : quotaName
  const full = localizedName(row.definition, i18n.language)
  const description = localizedDescription(row.definition, i18n.language)
  const label = usageLabel(row, credits, t)

  return (
    <div className="flex items-center gap-3 border-t border-border px-6 py-3.5">
      <UsageDial ratio={row.ratio} nearLimit={row.nearLimit} />
      <span className="min-w-0 flex-1 truncate text-sm" title={description ?? full}>
        {name}
      </span>
      <span
        className={cn(
          "shrink-0 text-sm tabular-nums",
          row.nearLimit ? "text-[#c75a48]" : "text-foreground",
        )}
      >
        {label}
      </span>
    </div>
  )
}

export function ProjectPlanUsageCard({ view }: { view: ProjectQuotaView }) {
  const { t } = useTranslation()
  const showCycle = view.rows.some((row) => windowLabelKey(row.definition.window) === "month")

  return (
    <Card id="project-plan-usage" className="w-full shrink-0 scroll-mt-4 md:sticky md:top-4 md:w-[380px]">
      <div className="flex items-center justify-between gap-3 px-6 py-5">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-foreground">{view.project.name}</h3>
          {showCycle ? (
            <p className="text-sm text-muted-foreground">{t("subscription.billingCycle")}</p>
          ) : null}
        </div>
        <span className="relative inline-flex shrink-0">
          <Button type="button" variant="outline" className="rounded-full" disabled>
            {t("subscription.upgradeLimits")}
            <span className="sr-only">, {t("subscription.soon")}</span>
          </Button>
          <Badge
            variant="inactive"
            className="pointer-events-none absolute -right-1.5 -top-1.5 px-1 text-[10px]"
          >
            {t("subscription.soon")}
          </Badge>
        </span>
      </div>
      {view.loading ? (
        <div className="px-6 pb-5" aria-busy="true">
          <div className="h-16 animate-pulse rounded-md bg-muted" />
        </div>
      ) : view.quotasError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
          <p className="text-sm text-destructive">{t("subscription.quotasError")}</p>
          <Button type="button" variant="outline" onClick={view.refetchQuotas}>
            {t("subscription.retry")}
          </Button>
        </div>
      ) : view.rows.length === 0 ? (
        <p className="border-t border-border px-6 py-4 text-sm text-muted-foreground">
          {t("subscription.noQuotas")}
        </p>
      ) : (
        <div>
          {view.usageError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-3">
              <p className="text-xs text-muted-foreground">{t("subscription.usageError")}</p>
              <Button type="button" variant="ghost" size="sm" onClick={view.refetchUsage}>
                {t("subscription.retry")}
              </Button>
            </div>
          ) : null}
          {view.rows.map((row) => (
            <UsageMeterRow key={row.code} row={row} />
          ))}
        </div>
      )}
    </Card>
  )
}
