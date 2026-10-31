import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge, Button, Card, CardContent } from "@sb0rka/ui"
import type { PlanResponse } from "../api"
import { localizedDescription, localizedName } from "../quota-format"
import { ComparePlansDialog } from "./compare-plans-dialog"

export function PlanHeroCard({ plan }: { plan: PlanResponse }) {
  const { t, i18n } = useTranslation()
  const [compareOpen, setCompareOpen] = useState(false)
  const description = localizedDescription(plan, i18n.language)

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 px-6 py-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="text-sm text-muted-foreground">{t("subscription.currentPlan")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                {localizedName(plan, i18n.language)}
              </h2>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {plan.code}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {!plan.is_available ? (
                <Badge variant="destructive">{t("subscription.legacyPlan")}</Badge>
              ) : null}
              {!plan.is_public ? (
                <Badge variant="inactive">{t("subscription.customPlan")}</Badge>
              ) : null}
            </div>
            {description ? (
              <p className="max-w-xl text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="relative inline-flex">
              <Button type="button" disabled>
                {t("subscription.changePlan")}
                <span className="sr-only">, {t("subscription.soon")}</span>
              </Button>
              <Badge
                variant="inactive"
                className="pointer-events-none absolute -right-2 -top-2 px-1.5"
              >
                {t("subscription.soon")}
              </Badge>
            </span>
            <Button type="button" variant="outline" onClick={() => setCompareOpen(true)}>
              {t("subscription.compare")}
            </Button>
          </div>
        </div>
      </CardContent>
      <ComparePlansDialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        currentPlan={plan}
      />
    </Card>
  )
}
