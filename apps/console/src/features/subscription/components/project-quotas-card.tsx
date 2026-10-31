import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown } from "lucide-react"
import { Badge, Button, Card, cn } from "@sb0rka/ui"
import type { ProjectQuotaView } from "../hooks"
import {
  formatQuotaPair,
  formatQuotaValue,
  localizedName,
  summaryRows,
  withCredits,
} from "../quota-format"
import { QuotaRow } from "./quota-row"

function summaryText(view: ProjectQuotaView, language: string, credits: string): string {
  return summaryRows(view.rows)
    .map((row) => {
      const unit = row.usage?.unit || row.definition.unit
      const name = localizedName(row.definition, language)
      if (row.usage?.status === "available" && row.usage.used != null) {
        const pair = formatQuotaPair(row.usage.used, row.effective, unit)
        return `${withCredits(pair.used, unit, credits)} / ${withCredits(pair.limit, unit, credits)} ${name}`
      }
      return `${withCredits(formatQuotaValue(row.effective, unit), unit, credits)} ${name}`
    })
    .join(" · ")
}

export function ProjectQuotasCard({ view }: { view: ProjectQuotaView }) {
  const { t, i18n } = useTranslation()
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  const open = manualOpen ?? view.nearLimit
  const credits = t("subscription.credits")
  const summary = summaryText(view, i18n.language, credits)

  return (
    <Card id={`subscription-project-${view.project.public_id}`} className="scroll-mt-4">
      <div className="flex flex-col gap-2 px-6 py-5">
        <button
          type="button"
          className="flex w-full items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={open}
          aria-controls={`subscription-project-panel-${view.project.public_id}`}
          onClick={() => setManualOpen(!(manualOpen ?? view.nearLimit))}
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate text-xl font-semibold tracking-tight">{view.project.name}</span>
              {!view.project.is_active ? (
                <Badge variant="inactive">{t("subscription.projectInactive")}</Badge>
              ) : null}
              {view.nearLimit ? (
                <Badge variant="destructive">{t("subscription.attentionLabel")}</Badge>
              ) : null}
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {view.loading
                ? t("common.loading")
                : view.plan
                  ? localizedName(view.plan, i18n.language)
                  : view.planError
                    ? t("subscription.planError")
                    : t("common.notAvailable")}
            </span>
            {!view.loading && summary ? (
              <span className="mt-1 block text-sm tabular-nums text-muted-foreground">{summary}</span>
            ) : null}
          </span>
          <ChevronDown
            className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180")}
            aria-hidden
          />
        </button>
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
