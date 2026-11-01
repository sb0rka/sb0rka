import { useTranslation } from "react-i18next"
import { Badge, Button, Card, cn, Tooltip, TooltipContent, TooltipTrigger } from "@sb0rka/ui"
import type { ProjectQuotaView } from "../hooks"
import {
  formatQuotaPair,
  formatQuotaValue,
  localizedDescription,
  localizedName,
  shortQuotaName,
  toggleSummaryRows,
  windowLabelKey,
  withCredits,
  type QuotaRowView,
} from "../quota-format"

function QuotaSummary({ rows }: { rows: QuotaRowView[] }) {
  const { t, i18n } = useTranslation()
  const credits = t("subscription.credits")
  if (rows.length === 0) return null

  return (
    <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {rows.map((row) => {
        const unit = row.usage?.unit || row.definition.unit
        const name = shortQuotaName(row, i18n.language, t)
        const full = localizedName(row.definition, i18n.language)
        const description = localizedDescription(row.definition, i18n.language)
        const window = windowLabelKey(row.definition.window)
        const limit = withCredits(formatQuotaValue(row.effective, unit), unit, credits)
        const used =
          row.usage?.status === "available" && row.usage.used != null
            ? withCredits(formatQuotaPair(row.usage.used, row.effective, unit).used, unit, credits)
            : t("common.notAvailable")
        const entitled =
          row.entitled > 0
            ? t("subscription.bonus", {
                value: withCredits(formatQuotaValue(row.entitled, unit), unit, credits),
              })
            : null
        return (
          <Tooltip key={row.code}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex items-baseline gap-1 text-xs",
                  row.nearLimit ? "text-[#c75a48]" : "text-foreground",
                )}
              >
                <span className={cn(!row.nearLimit && "text-muted-foreground")}>{name}</span>
                <span className="tabular-nums">
                  {t("subscription.usageOf", { used, limit })}
                </span>
                {window ? (
                  <span className={cn(!row.nearLimit && "text-muted-foreground")}>
                    {t(`subscription.windowShort.${window}`)}
                  </span>
                ) : null}
                {entitled ? (
                  <span className={cn(!row.nearLimit && "text-muted-foreground")}>{entitled}</span>
                ) : null}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{full}</p>
              {description ? <p className="text-muted-foreground">{description}</p> : null}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </span>
  )
}

export function ProjectQuotasCard({
  view,
  selected,
  onSelect,
}: {
  view: ProjectQuotaView
  selected: boolean
  onSelect: () => void
}) {
  const { t, i18n } = useTranslation()
  const planName = view.loading
    ? t("common.loading")
    : view.plan
      ? localizedName(view.plan, i18n.language)
      : view.planError
        ? t("subscription.planError")
        : t("common.notAvailable")

  return (
    <Card
      id={`subscription-project-${view.project.public_id}`}
      className={cn("w-full scroll-mt-4", selected && "ring-2 ring-ring")}
    >
      <div
        role="option"
        aria-selected={selected}
        aria-controls="project-plan-usage"
        tabIndex={0}
        className="flex w-full cursor-pointer flex-col gap-2 px-6 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          onSelect()
        }}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-2xl font-semibold tracking-tight">{view.project.name}</span>
          <span className="text-sm text-muted-foreground">{planName}</span>
          {!view.project.is_active ? (
            <Badge variant="inactive">{t("subscription.projectInactive")}</Badge>
          ) : null}
          {view.nearLimit ? (
            <Badge variant="warning">{t("subscription.attentionLabel")}</Badge>
          ) : null}
        </span>
        {!view.loading ? <QuotaSummary rows={toggleSummaryRows(view.rows)} /> : null}
      </div>
      {view.planError && !view.loading ? (
        <div className="px-6 pb-5">
          <Button type="button" variant="outline" onClick={view.refetchPlan}>
            {t("subscription.retry")}
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
