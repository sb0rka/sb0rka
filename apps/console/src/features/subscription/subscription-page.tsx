import { Badge } from "@/components/ui/badge"
import { useTranslation } from "react-i18next"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ApiError } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { useCurrentPlan, usePlans, useSubscriptionUsage } from "./hooks"
import type { SubscriptionUsage } from "./hooks"

/** Limits that exist in the product UI today (deployed / available). */
const DEPLOYED_LIMIT_KEYS = ["project_limit", "db_limit", "secret_limit"] as const

type DeployedLimitKey = (typeof DEPLOYED_LIMIT_KEYS)[number]

interface LimitItem {
  key: DeployedLimitKey
  labelKey: string
  usageKey: keyof SubscriptionUsage
}

const LIMIT_ITEMS: LimitItem[] = [
  { key: "project_limit", labelKey: "subscription.limits.projects", usageKey: "projects" },
  { key: "db_limit", labelKey: "subscription.limits.databases", usageKey: "databases" },
  { key: "secret_limit", labelKey: "subscription.limits.secrets", usageKey: "secrets" },
]

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

function getUsageProgress(used: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min((used / limit) * 100, 100)
}

export function SubscriptionPage() {
  const { t } = useTranslation()
  const currentPlanQuery = useCurrentPlan()
  const plansQuery = usePlans()
  const usageQuery = useSubscriptionUsage()

  const currentPlan = currentPlanQuery.data
  const plans = plansQuery.data?.plans ?? []
  const usage = usageQuery.data
  const isLoading = currentPlanQuery.isLoading || plansQuery.isLoading || usageQuery.isLoading
  const error = currentPlanQuery.error ?? plansQuery.error

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[500px]">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    )
  }

  if (error || !currentPlan) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[500px]">
        <p className="text-sm text-destructive">
          {getErrorMessage(error, t("subscription.loadError"))}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 text-foreground dark:!bg-transparent">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold leading-normal text-foreground">
            {t("subscription.title")}
          </h1>
          <Badge className="shrink-0 rounded-full border-0 bg-[var(--plan-badge-bg)] px-2.5 py-0.5 text-xs font-semibold leading-4 text-[var(--plan-badge-fg)] hover:bg-[var(--plan-badge-bg)]">
            {currentPlan.name}
          </Badge>
        </div>
        <p className="text-sm text-[#667085] dark:text-muted-foreground">
          {t("subscription.description")}
        </p>
      </div>

      <Card className="border-none bg-white shadow-none dark:border-border dark:!bg-card">
        <CardContent className="flex flex-wrap items-start gap-4 px-0">
          {LIMIT_ITEMS.map((item) => {
            const limit = currentPlan[item.key]
            const used = usage?.[item.usageKey]
            const progress = getUsageProgress(typeof used === "number" ? used : 0, limit)

            return (
              <div
                key={item.key}
                className="min-w-[240px] max-w-sm shrink-0 rounded-lg border border-[#EAECF0] bg-white p-4 dark:border-border dark:!bg-card"
              >
                <p className="text-sm text-[#667085] dark:text-muted-foreground">
                  {t(item.labelKey)}
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight">{limit}</p>
                <p className="mt-1 text-sm text-[#667085] dark:text-muted-foreground">
                  {t("subscription.used")}{" "}
                  {typeof used === "number" ? `${used} / ${limit}` : "—"}
                </p>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#F2F4F7] dark:!bg-muted">
                  <div
                    className="h-full rounded-full bg-[#1D2939] transition-all dark:!bg-foreground"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card className="border-[#EAECF0] bg-white shadow-none dark:border-border dark:!bg-card">
        <CardHeader>
          <CardTitle className="text-xl">{t("subscription.availablePlans")}</CardTitle>
          <CardDescription className="text-[#667085] dark:text-muted-foreground">
            {t("subscription.comparePlans")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-start gap-4">
          {plans.length === 0 ? (
            <p className="w-full text-sm text-[#667085] dark:text-muted-foreground">
              {t("subscription.emptyPlans")}
            </p>
          ) : (
            plans.map((plan) => {
              const isCurrent = plan.id === currentPlan.id
              return (
                <div
                  key={plan.id}
                  className={cn(
                    "flex min-w-[240px] max-w-sm shrink-0 flex-col rounded-lg border border-[#EAECF0] bg-white p-5 dark:border-border dark:!bg-transparent",
                    isCurrent && "border-black dark:border-foreground",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold tracking-tight">
                        {plan.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm text-[#667085] dark:text-muted-foreground">
                        {plan.description || t("subscription.noPlanDescription")}
                      </p>
                    </div>
                    {isCurrent ? (
                      <Badge className="rounded-md border border-[#EAECF0] bg-white px-3 py-1 font-medium text-[#667085] hover:bg-white dark:border-border dark:!bg-transparent dark:text-muted-foreground dark:hover:bg-transparent">
                        {t("subscription.current")}
                      </Badge>
                    ) : null}
                  </div>

                  <ul className="mt-4 overflow-hidden rounded-md bg-[#F9FAFB] dark:!bg-secondary">
                    {LIMIT_ITEMS.map((item) => (
                      <li
                        key={item.key}
                        className="flex items-baseline justify-between gap-4 px-3 py-2.5 text-sm"
                      >
                        <span className="text-[#667085] dark:text-muted-foreground">
                          {t(item.labelKey)}
                        </span>
                        <span className="font-semibold tabular-nums">{plan[item.key]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
