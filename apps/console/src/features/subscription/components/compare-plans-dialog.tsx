import { useTranslation } from "react-i18next"
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  cn,
} from "@sb0rka/ui"
import type { PlanResponse } from "../api"
import { usePublicPlans } from "../hooks"
import { localizedDescription, localizedName } from "../quota-format"

interface ComparePlansDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPlan: PlanResponse
}

export function ComparePlansDialog({
  open,
  onOpenChange,
  currentPlan,
}: ComparePlansDialogProps) {
  const { t, i18n } = useTranslation()
  const plansQuery = usePublicPlans(open)
  const accountPlans = (plansQuery.data?.plans ?? [])
    .filter((plan) => plan.kind === "account")
    .sort((left, right) =>
      localizedName(left, i18n.language).localeCompare(localizedName(right, i18n.language), i18n.language),
    )
  const currentIsListed = accountPlans.some((plan) => plan.id === currentPlan.id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(40rem,calc(100%-2rem))] max-w-[calc(100%-2rem)] overflow-y-auto md:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("subscription.compareTitle")}</DialogTitle>
          <DialogDescription>{t("subscription.compareDescription")}</DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-6">
          {plansQuery.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : plansQuery.isError ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-destructive">{t("subscription.loadError")}</p>
              <Button type="button" variant="outline" onClick={() => void plansQuery.refetch()}>
                {t("subscription.retry")}
              </Button>
            </div>
          ) : accountPlans.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("subscription.emptyPlans")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {!currentIsListed ? (
                <p className="text-sm text-muted-foreground">{t("subscription.customNotListed")}</p>
              ) : null}
              <ul className="grid gap-3 sm:grid-cols-2">
                {accountPlans.map((plan) => {
                  const current = plan.id === currentPlan.id
                  const description = localizedDescription(plan, i18n.language)
                  return (
                    <li
                      key={plan.id}
                      aria-current={current ? "true" : undefined}
                      className={cn(
                        "flex flex-col gap-2 rounded-lg border border-border p-4",
                        current && "border-foreground",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold">{localizedName(plan, i18n.language)}</p>
                        {current ? <Badge variant="active">{t("subscription.current")}</Badge> : null}
                        {!plan.is_available ? (
                          <Badge variant="destructive">{t("subscription.legacyPlan")}</Badge>
                        ) : null}
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">{plan.code}</p>
                      <p className="text-sm text-muted-foreground">
                        {description ?? t("subscription.noPlanDescription")}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
