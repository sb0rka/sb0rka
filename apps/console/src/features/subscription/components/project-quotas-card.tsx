import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown } from "lucide-react"
import { Badge, Button, Card, cn, Tooltip, TooltipContent, TooltipTrigger } from "@sb0rka/ui"
import type { ProjectQuotaView } from "../hooks"
import {
  formatQuotaPair,
  formatQuotaValue,
  localizedDescription,
  localizedName,
  toggleSummaryRows,
  windowLabelKey,
  withCredits,
  type QuotaRowView,
} from "../quota-format"
import { QuotaRow } from "./quota-row"

function shortQuotaName(
  row: QuotaRowView,
  language: string,
  t: (key: string) => string,
): string {
  const key = `subscription.quotaShort.${row.code}`
  const translated = t(key)
  if (translated && translated !== key) return translated
  return localizedName(row.definition, language)
}

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
                  row.nearLimit ? "text-destructive" : "text-foreground",
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

export function ProjectQuotasCard({ view }: { view: ProjectQuotaView }) {
  const { t, i18n } = useTranslation()
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  const open = manualOpen ?? view.nearLimit
  const toggle = () => setManualOpen(!(manualOpen ?? view.nearLimit))

  return (
    <Card id={`subscription-project-${view.project.public_id}`} className="scroll-mt-4">
      <div className="flex flex-col gap-2 px-6 py-5">
        {/* button and role=button pick up the global press scale */}
        <div
          className="flex w-full cursor-pointer items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={open}
          aria-controls={`subscription-project-panel-${view.project.public_id}`}
          tabIndex={0}
          onClick={toggle}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return
            event.preventDefault()
            toggle()
          }}
        >
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="truncate text-xl font-semibold tracking-tight">{view.project.name}</span>
              <span className="text-sm text-muted-foreground">
                {view.loading
                  ? t("common.loading")
                  : view.plan
                    ? localizedName(view.plan, i18n.language)
                    : view.planError
                      ? t("subscription.planError")
                      : t("common.notAvailable")}
              </span>
              {!view.project.is_active ? (
                <Badge variant="inactive">{t("subscription.projectInactive")}</Badge>
              ) : null}
              {view.nearLimit ? (
                <Badge variant="destructive">{t("subscription.attentionLabel")}</Badge>
              ) : null}
            </span>
            {!view.loading ? <QuotaSummary rows={toggleSummaryRows(view.rows)} /> : null}
          </span>
          <ChevronDown
            className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180")}
            aria-hidden
          />
        </div>
        {view.planError && !view.loading ? (
          <Button type="button" variant="outline" className="self-start" onClick={view.refetchPlan}>
            {t("subscription.retry")}
          </Button>
        ) : null}
      </div>
      {open ? (
        <div id={`subscription-project-panel-${view.project.public_id}`} className="px-6 pb-5">
          {view.loading ? (
            <div className="h-16 animate-pulse rounded-md bg-muted" />
          ) : view.quotasError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-sm text-destructive">{t("subscription.quotasError")}</p>
              <Button type="button" variant="outline" onClick={view.refetchQuotas}>
                {t("subscription.retry")}
              </Button>
            </div>
          ) : view.rows.length === 0 ? (
            <p className="border-t border-border pt-4 text-sm text-muted-foreground">
              {t("subscription.noQuotas")}
            </p>
          ) : (
            <div>
              {view.usageError ? (
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">{t("subscription.usageError")}</p>
                  <Button type="button" variant="ghost" size="sm" onClick={view.refetchUsage}>
                    {t("subscription.retry")}
                  </Button>
                </div>
              ) : null}
              {view.rows.map((row) => (
                <QuotaRow key={row.code} row={row} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </Card>
  )
}
