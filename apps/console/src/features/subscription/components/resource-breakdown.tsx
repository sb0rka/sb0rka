import { useTranslation } from "react-i18next"
import { Tooltip, TooltipContent, TooltipTrigger } from "@sb0rka/ui"
import type { ResourceUsage } from "../api"
import { formatQuotaValue, relativeAge, withCredits } from "../quota-format"

function ageText(
  iso: string | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  const age = relativeAge(iso)
  if (!age) return null
  if (age.key === "justNow") return t("subscription.ageJustNow")
  if (age.key === "minutesAgo") return t("subscription.ageMinutes", { count: age.count })
  if (age.key === "hoursAgo") return t("subscription.ageHours", { count: age.count })
  return t("subscription.ageDays", { count: age.count })
}

export function ResourceBreakdown({
  resources,
  unit,
}: {
  resources: ResourceUsage[]
  unit: string
}) {
  const { t } = useTranslation()
  const credits = t("subscription.credits")

  return (
    <ul className="mt-2 divide-y divide-border rounded-md border border-border">
      {resources.map((resource) => {
        const when = ageText(resource.observed_at, t)
        const amount = resource.used == null
          ? t("common.notAvailable")
          : withCredits(formatQuotaValue(resource.used, unit), unit, credits)
        return (
          <li key={resource.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
              {resource.public_id}
            </span>
            {resource.status === "unavailable" ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm text-muted-foreground">{t("common.notAvailable")}</span>
                </TooltipTrigger>
                <TooltipContent>{t("subscription.unavailable")}</TooltipContent>
              </Tooltip>
            ) : resource.status === "unsupported" ? (
              <span className="text-xs text-muted-foreground">{t("subscription.notMeasured")}</span>
            ) : (
              <span className="shrink-0 text-sm tabular-nums">
                {amount}
                {when ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t("subscription.updated", { when })}
                  </span>
                ) : null}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
