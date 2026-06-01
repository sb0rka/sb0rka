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
import {
  PageStagger,
  SlideIn,
  StaggerGroup,
  UsageProgressBar,
} from "@/components/motion/page-entrance"
import { staggerStep } from "@/lib/motion"

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
    <PageStagger className="flex flex-col gap-6 text-[var(--subscription-heading)] !bg-transparent">
      <SlideIn className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold leading-normal text-[var(--subscription-heading)]">
            {t("subscription.title")}
          </h1>
          <Badge className="mt-1 shrink-0 rounded-full border-0 bg-[var(--plan-badge-bg)] px-2.5 py-0.5 text-xs font-semibold leading-4 text-[var(--plan-badge-fg)]">
            {currentPlan.name}
          </Badge>
        </div>
        <p className="text-sm text-[var(--subscription-muted)]">
          {t("subscription.description")}
        </p>
      </SlideIn>

      <SlideIn>
        <Card className="border border-[var(--subscription-border)] !bg-transparent shadow-none">
          <CardContent className="flex flex-wrap items-start gap-4 p-6">
            <StaggerGroup className="flex flex-wrap items-start gap-4">
              {LIMIT_ITEMS.map((item, index) => {
                const limit = currentPlan[item.key]
                const used = usage?.[item.usageKey]
                const progress = getUsageProgress(typeof used === "number" ? used : 0, limit)

                return (
                  <SlideIn
                    key={item.key}
                    className="min-w-[240px] max-w-sm shrink-0 rounded-lg border border-[var(--subscription-border)] !bg-transparent p-4"
                  >
                    <p className="text-sm text-[var(--subscription-muted)]">
                      {t(item.labelKey)}
                    </p>
                    <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--subscription-heading)]">
                      {limit}
                    </p>
                    <p className="mt-1 text-sm text-[var(--subscription-muted)]">
                      {t("subscription.used")}{" "}
                      {typeof used === "number" ? `${used} / ${limit}` : "—"}
                    </p>
                    <UsageProgressBar
                      className="mt-3 !bg-[var(--subscription-progress-track)] dark:!bg-[#2a2a2a]"
                      barClassName="!bg-[var(--subscription-accent-bright)] dark:!bg-[#76933c]"
                      progress={progress}
                      delay={index * staggerStep}
                    />
                  </SlideIn>
                )
              })}
            </StaggerGroup>
          </CardContent>
        </Card>
      </SlideIn>

      <SlideIn>
        <Card className="border border-[var(--subscription-border)] !bg-transparent shadow-none text-[var(--subscription-heading)]">
          <CardHeader>
            <CardTitle className="text-xl text-[var(--subscription-heading)]">
              {t("subscription.availablePlans")}
            </CardTitle>
            <CardDescription className="text-[var(--subscription-muted)]">
              {t("subscription.comparePlans")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-start gap-4">
            {plans.length === 0 ? (
              <p className="w-full text-sm text-[var(--subscription-muted)]">
                {t("subscription.emptyPlans")}
              </p>
            ) : (
              <StaggerGroup className="flex flex-wrap items-start gap-4">
                {plans.map((plan) => {
                  const isCurrent = plan.id === currentPlan.id
                  return (
                    <SlideIn
                      key={plan.id}
                      className={cn(
                        "flex min-w-[240px] max-w-sm shrink-0 flex-col rounded-lg border border-[var(--subscription-border)] !bg-transparent p-5",
                        isCurrent && "border-[var(--subscription-accent)]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-semibold tracking-tight text-[var(--subscription-heading)]">
                            {plan.name}
                          </h3>
                          <p className="mt-1 line-clamp-2 text-sm text-[var(--subscription-muted)]">
                            {plan.description || t("subscription.noPlanDescription")}
                          </p>
                        </div>
                        {isCurrent ? (
                          <Badge className="rounded-md border border-[var(--subscription-accent)] bg-[var(--subscription-accent)] px-3 py-1 font-medium text-[var(--plan-badge-fg)] hover:bg-[var(--subscription-accent)]">
                            {t("subscription.current")}
                          </Badge>
                        ) : null}
                      </div>

                      <ul className="mt-4 overflow-hidden rounded-md !bg-transparent">
                        {LIMIT_ITEMS.map((limitItem) => (
                          <li
                            key={limitItem.key}
                            className="flex items-baseline justify-between gap-4 px-3 py-2.5 text-sm"
                          >
                            <span className="text-[var(--subscription-muted)]">
                              {t(limitItem.labelKey)}
                            </span>
                            <span className="font-semibold tabular-nums text-[var(--subscription-heading)]">
                              {plan[limitItem.key]}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </SlideIn>
                  )
                })}
              </StaggerGroup>
            )}
          </CardContent>
        </Card>
      </SlideIn>
    </PageStagger>
  )
}
