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
import type { PlanResponse } from "./api"

interface LimitItem {
  key: keyof Pick<
    PlanResponse,
    | "project_limit"
    | "db_limit"
    | "secret_limit"
    | "function_limit"
    | "code_limit"
    | "group_limit"
  >
  labelKey: string
  usageKey?: keyof SubscriptionUsage
}

const LIMIT_ITEMS: LimitItem[] = [
  { key: "project_limit", labelKey: "subscription.limits.projects", usageKey: "projects" },
  { key: "db_limit", labelKey: "subscription.limits.databases", usageKey: "databases" },
  { key: "secret_limit", labelKey: "subscription.limits.secrets", usageKey: "secrets" },
  { key: "function_limit", labelKey: "subscription.limits.functions" },
  { key: "code_limit", labelKey: "subscription.limits.codeUnits" },
  { key: "group_limit", labelKey: "subscription.limits.groups" },
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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground">{t("subscription.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("subscription.description")}
          </p>
        </div>
        <Badge variant="active">{t("subscription.currentPlan")}</Badge>
      </div>

      <Card>
        <CardHeader className="gap-2">
          <CardTitle>{currentPlan.name}</CardTitle>
          <CardDescription>
            {currentPlan.description || t("subscription.noPlanDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-start gap-4">
          {LIMIT_ITEMS.map((item) => {
            const limit = currentPlan[item.key]
            const used = item.usageKey ? usage?.[item.usageKey] : undefined
            const progress = item.usageKey
              ? getUsageProgress(typeof used === "number" ? used : 0, limit)
              : 0

            return (
              <div
                key={item.key}
                className="min-w-[240px] max-w-sm shrink-0 rounded-lg border border-border p-4"
              >
                <p className="text-sm text-muted-foreground">{t(item.labelKey)}</p>
                <p className="mt-2 text-2xl font-bold tracking-tight">{limit}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("subscription.used")}{" "}
                  {typeof used === "number" ? `${used} / ${limit}` : "—"}
                </p>
                {/* {item.usageKey ? ( */}
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[#5c7c2f] transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                {/* ) : null} */}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("subscription.availablePlans")}</CardTitle>
          <CardDescription>
            {t("subscription.comparePlans")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-start gap-4">
          {plans.length === 0 ? (
            <p className="w-full text-sm text-muted-foreground">{t("subscription.emptyPlans")}</p>
          ) : (
            plans.map((plan) => {
              const isCurrent = plan.id === currentPlan.id
              return (
                <div
                  key={plan.id}
                  className={cn(
                    "flex min-w-[240px] max-w-sm shrink-0 flex-col rounded-lg border border-border p-5",
                    isCurrent && "border-[#5c7c2f] ring-1 ring-[#5c7c2f]/25",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold tracking-tight">
                        {plan.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {plan.description || t("subscription.noPlanDescription")}
                      </p>
                    </div>
                    {isCurrent ? <Badge variant="active-solid">{t("subscription.current")}</Badge> : null}
                  </div>

                  <ul className="mt-4 overflow-hidden rounded-md">
                    {LIMIT_ITEMS.map((item) => (
                      <li
                        key={item.key}
                        className="flex items-baseline justify-between gap-4 px-3 py-2.5 text-sm"
                      >
                        <span className="text-muted-foreground">{t(item.labelKey)}</span>
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
