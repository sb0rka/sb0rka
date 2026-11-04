import { Link, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Badge, Button, cn } from "@sb0rka/ui"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import type { PlanQuota, PlanResponse } from "./api"
import { ASSEMBLY_MIN_VISIBLE_MS, AssemblingLoader, useMinimumVisible } from "./components/assembling.tsx"
import { useAccountPlan, usePlan, useProjectPlan, usePublicPlans } from "./hooks"
import {
  formatQuotaValue,
  localizedDescription,
  localizedName,
  shortQuotaName,
  windowLabelKey,
  withCredits,
} from "./quota-format"

const LLM_BALANCE_CODE = "llms.spend.micros"

function planQuotaValue(quota: PlanQuota, credits: string): string {
  return withCredits(formatQuotaValue(quota.limit_value, quota.unit), quota.unit, credits)
}

function quotaLabel(
  quota: PlanQuota,
  language: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const name = shortQuotaName({ code: quota.code, definition: quota }, language, t, "quotaLabel")
  const window = windowLabelKey(quota.window)
  if (!window) return name
  return t("subscription.quotaWithWindow", {
    name,
    window: t(`subscription.window.${window}`),
  })
}

function AccountPlanQuotas({ quotas }: { quotas: PlanQuota[] }) {
  const { t, i18n } = useTranslation()
  const credits = t("subscription.credits")
  const rows = quotas
    .filter((quota) => quota.code !== LLM_BALANCE_CODE)
    .sort((left, right) =>
      localizedName(left, i18n.language).localeCompare(localizedName(right, i18n.language), i18n.language),
    )
  if (rows.length === 0) return null

  return (
    <dl className="flex flex-col gap-1.5 border-t border-border pt-3">
      {rows.map((quota) => {
        const description = localizedDescription(quota, i18n.language)
        const value = planQuotaValue(quota, credits)
        return (
          <div key={quota.id} className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0 text-sm text-muted-foreground" title={description}>
              {quotaLabel(quota, i18n.language, t)}
            </dt>
            <dd className="shrink-0 text-sm tabular-nums text-foreground">{value}</dd>
          </div>
        )
      })}
    </dl>
  )
}

function PlanColumn({
  plan,
  current,
  custom,
  kind,
  quotasLoading,
  quotasError,
  onQuotasRetry,
}: {
  plan: PlanResponse & { quotas?: PlanQuota[] }
  current: boolean
  custom: boolean
  kind: "account" | "project"
  quotasLoading?: boolean
  quotasError?: boolean
  onQuotasRetry?: () => void
}) {
  const { t, i18n } = useTranslation()
  const description = localizedDescription(plan, i18n.language)
  const showQuotas = custom || kind === "account"

  return (
    <td
      aria-current={current ? "true" : undefined}
      className="w-max max-w-72 align-top rounded-lg border border-border p-4"
    >
      <div className={cn("flex max-w-64 flex-col gap-4", kind === "account" ? "w-64" : "w-max")}>
        <div className={cn("flex flex-col gap-4", kind === "account" && "min-h-24")}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-foreground">
              {localizedName(plan, i18n.language)}
            </span>
            {current ? <Badge variant="active">{t("subscription.current")}</Badge> : null}
            {!plan.is_available ? (
              <Badge variant="destructive">{t("subscription.legacyPlan")}</Badge>
            ) : null}
          </div>
          {custom ? (
            <p className="whitespace-nowrap text-sm font-semibold tracking-tight text-foreground">
              {t("subscription.customNotListed")}
            </p>
          ) : null}
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {showQuotas ? (
          custom && quotasLoading ? (
            <div aria-busy="true" className="flex flex-col gap-1.5 border-t border-border pt-3">
              <div className="h-4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          ) : custom && quotasError ? (
            <div className="flex flex-col items-start gap-2 border-t border-border pt-3">
              <p className="text-sm text-destructive">{t("subscription.loadError")}</p>
              <Button type="button" variant="outline" onClick={onQuotasRetry}>
                {t("subscription.retry")}
              </Button>
            </div>
          ) : (
            <AccountPlanQuotas quotas={plan.quotas ?? []} />
          )
        ) : null}
        {current ? null : (
          <span className="relative mt-1 inline-flex w-full">
            <Button type="button" className="w-full" disabled>
              {t("subscription.select")}
              <span className="sr-only">, {t("subscription.soon")}</span>
            </Button>
            <Badge variant="inactive" className="pointer-events-none absolute -right-2 -top-2 px-1.5">
              {t("subscription.soon")}
            </Badge>
          </span>
        )}
      </div>
    </td>
  )
}

export function PlansPage() {
  const { t, i18n } = useTranslation()
  const [searchParams] = useSearchParams()
  const kind = searchParams.get("kind") === "project" ? "project" : "account"
  const projectId = kind === "project" ? searchParams.get("project") : null
  const plansQuery = usePublicPlans(true)
  const accountPlanQuery = useAccountPlan()
  const projectPlanQuery = useProjectPlan(projectId)
  const currentQuery = kind === "project" ? projectPlanQuery : accountPlanQuery
  // isLoading stays false when the project query is disabled (no ?project=).
  // isPending would stay true for that disabled query and hold the loader forever.
  const showAssembling = useMinimumVisible(
    plansQuery.isPending || currentQuery.isLoading,
    ASSEMBLY_MIN_VISIBLE_MS,
  )

  const listedPlans = (plansQuery.data?.plans ?? [])
    .filter((plan) => plan.kind === kind)
    .sort((left, right) =>
      localizedName(left, i18n.language).localeCompare(
        localizedName(right, i18n.language),
        i18n.language,
      ),
    )

  const currentPlan = currentQuery.isSuccess ? currentQuery.data : undefined
  const customPlan =
    plansQuery.isSuccess &&
    currentPlan != null &&
    !listedPlans.some((plan) => plan.id === currentPlan.id)
      ? currentPlan
      : null
  const customQuotasQuery = usePlan(customPlan?.id ?? null)
  const customPlanWithQuotas = customQuotasQuery.data ?? customPlan

  return (
    <PageStagger className="flex flex-col gap-6">
      <SlideIn>
        <div className="space-y-3">
          <Link
            to="/subscription"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {t("subscription.backToSubscription")}
          </Link>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">
              {t(kind === "project" ? "subscription.projectPlansTitle" : "subscription.plansTitle")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t(
                kind === "project"
                  ? "subscription.projectPlansDescription"
                  : "subscription.plansDescription",
              )}
            </p>
          </div>
        </div>
      </SlideIn>
      <SlideIn>
        {showAssembling ? (
          <AssemblingLoader />
        ) : plansQuery.isError || currentQuery.isError ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-6">
            <p className="text-sm text-destructive">{t("subscription.loadError")}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (plansQuery.isError) void plansQuery.refetch()
                if (currentQuery.isError) void currentQuery.refetch()
              }}
            >
              {t("subscription.retry")}
            </Button>
          </div>
        ) : listedPlans.length === 0 && customPlan == null ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-6">
            <p className="text-sm text-muted-foreground">{t("subscription.emptyPlans")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* TODO: BACKEND_TODO — plan price is not on the catalog response. */}
            <div className="overflow-x-auto p-1">
              <table className="w-max border-separate border-spacing-3 text-left">
                <tbody>
                  <tr>
                    {customPlanWithQuotas ? (
                      <PlanColumn
                        plan={customPlanWithQuotas}
                        current
                        custom
                        kind={kind}
                        quotasLoading={customQuotasQuery.isLoading}
                        quotasError={customQuotasQuery.isError}
                        onQuotasRetry={() => void customQuotasQuery.refetch()}
                      />
                    ) : null}
                    {listedPlans.map((plan) => (
                      <PlanColumn
                        key={plan.id}
                        plan={plan}
                        current={plan.id === currentPlan?.id}
                        custom={false}
                        kind={kind}
                      />
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SlideIn>
    </PageStagger>
  )
}
