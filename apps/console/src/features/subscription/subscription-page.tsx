import { useTranslation } from "react-i18next"
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@sb0rka/ui"
import { ApiError } from "@/lib/api-client"
import { planDescription, planTitle } from "./api"
import { useCurrentPlan, usePlans, useSubscriptionUsage } from "./hooks"
import type { SubscriptionUsage } from "./hooks"
import {
  PageStagger,
  SlideIn,
  StaggerGroup,
} from "@/components/motion/page-entrance"
import {
  MobilePlanCard,
  MobileUsageCard,
} from "./components/mobile-usage-card"

interface UsageItem {
  labelKey: string
  usageKey: keyof SubscriptionUsage
}

const USAGE_ITEMS: UsageItem[] = [
  { labelKey: "subscription.limits.projects", usageKey: "projects" },
  { labelKey: "subscription.limits.databases", usageKey: "databases" },
  { labelKey: "subscription.limits.secrets", usageKey: "secrets" },
]

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export function SubscriptionPage() {
  const { t, i18n } = useTranslation()
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
          <Badge className="mt-1 shrink-0 rounded-full border border-[var(--subscription-border)] bg-[var(--plan-badge-bg)] px-2.5 py-0.5 text-xs font-semibold leading-4 text-[var(--plan-badge-fg)]">
            {planTitle(currentPlan, i18n.language)}
          </Badge>
        </div>
        <p className="text-sm text-[var(--subscription-muted)]">
          {t("subscription.description")}
        </p>
      </SlideIn>

      <SlideIn>
        <StaggerGroup className="grid gap-3 md:hidden">
          {USAGE_ITEMS.map((item) => (
            <SlideIn key={item.usageKey}>
              <MobileUsageCard
                label={t(item.labelKey)}
                used={usage?.[item.usageKey]}
                usedLabel={t("subscription.used")}
              />
            </SlideIn>
          ))}
        </StaggerGroup>
        <StaggerGroup className="hidden flex-wrap items-start gap-4 md:flex">
          {USAGE_ITEMS.map((item) => {
            const used = usage?.[item.usageKey]

            return (
              <SlideIn
                key={item.usageKey}
                className="min-w-[240px] max-w-sm shrink-0 rounded-lg border border-[var(--subscription-border)] !bg-transparent p-4"
              >
                <p className="text-sm text-[var(--subscription-muted)]">
                  {t(item.labelKey)}
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--subscription-heading)]">
                  {typeof used === "number" ? used : "—"}
                </p>
                <p className="mt-1 text-sm text-[var(--subscription-muted)]">
                  {t("subscription.used")}
                </p>
              </SlideIn>
            )
          })}
        </StaggerGroup>
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
              <>
                <StaggerGroup className="grid w-full gap-3 md:hidden">
                  {plans.map((plan) => (
                    <SlideIn key={plan.id}>
                      <MobilePlanCard
                        name={planTitle(plan, i18n.language)}
                        description={planDescription(plan, i18n.language)}
                        isCurrent={plan.id === currentPlan.id}
                        currentLabel={t("subscription.current")}
                        fallbackDescription={t("subscription.noPlanDescription")}
                      />
                    </SlideIn>
                  ))}
                </StaggerGroup>
                <StaggerGroup className="hidden flex-wrap items-start gap-4 md:flex">
                  {plans.map((plan) => {
                    const isCurrent = plan.id === currentPlan.id
                    return (
                      <SlideIn
                        key={plan.id}
                        className="flex min-w-[240px] max-w-sm shrink-0 flex-col rounded-lg border border-[var(--subscription-border)] !bg-transparent p-5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-lg font-semibold tracking-tight text-[var(--subscription-heading)]">
                              {planTitle(plan, i18n.language)}
                            </h3>
                            <p className="mt-1 line-clamp-2 text-sm text-[var(--subscription-muted)]">
                              {planDescription(plan, i18n.language) || t("subscription.noPlanDescription")}
                            </p>
                          </div>
                          {isCurrent ? (
                            <Badge className="rounded-md border border-[var(--subscription-accent)] bg-[var(--subscription-accent)] px-3 py-1 font-medium text-[var(--subscription-accent-fg)] hover:bg-[var(--subscription-accent)]">
                              {t("subscription.current")}
                            </Badge>
                          ) : null}
                        </div>

                      </SlideIn>
                    )
                  })}
                </StaggerGroup>
              </>
            )}
          </CardContent>
        </Card>
      </SlideIn>
    </PageStagger>
  )
}
