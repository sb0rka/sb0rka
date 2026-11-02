import { Link, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Badge, Button, cn } from "@sb0rka/ui"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import type { PlanQuota } from "./api"
import {
  ASSEMBLY_MIN_VISIBLE_MS,
  AssemblingGraphic,
  AssemblingStyle,
  useMinimumVisible,
  type AssemblyPart,
} from "./components/assembling.tsx"
import { useAccountPlan, useProjectPlan, usePublicPlans } from "./hooks"
import {
  formatMoneyWithSign,
  formatQuotaValue,
  localizedDescription,
  localizedName,
  shortQuotaName,
  windowLabelKey,
  withCredits,
} from "./quota-format"

const LLM_BALANCE_CODE = "llms.spend.micros"
const MICROS_PER_RUBLE = 1_000_000

function planQuotaValue(quota: PlanQuota, credits: string): string {
  if (quota.code === LLM_BALANCE_CODE) {
    const rubles = quota.limit_value / MICROS_PER_RUBLE
    return formatMoneyWithSign({ RUB: String(rubles) }, "RUB") ?? "—"
  }
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
  const rows = [...quotas].sort((left, right) =>
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

const PLAN_PARTS: readonly AssemblyPart[] = [
  { x: 16, y: 16, w: 96, h: 10, rx: 2, dx: 0, dy: -48 },
  { x: 124, y: 16, w: 40, h: 10, rx: 5, dx: 56, dy: 0 },
  { x: 16, y: 52, w: 176, h: 6, rx: 3, dx: -64, dy: 0 },
  { x: 16, y: 68, w: 136, h: 6, rx: 3, dx: -64, dy: 0 },
  { x: 16, y: 84, w: 156, h: 6, rx: 3, dx: -64, dy: 0 },
  { x: 16, y: 112, w: 176, h: 16, rx: 4, dx: 0, dy: 48 },
]

function AssemblingPlans() {
  return (
    <div className="flex gap-3" aria-busy="true">
      <AssemblingStyle />
      <AssemblingGraphic className="h-36 w-52 shrink-0" viewBox="0 0 208 144" parts={PLAN_PARTS} />
      <AssemblingGraphic
        className="h-36 w-52 shrink-0"
        viewBox="0 0 208 144"
        parts={PLAN_PARTS}
        delayMs={260}
      />
      <AssemblingGraphic
        className="h-36 w-52 shrink-0"
        viewBox="0 0 208 144"
        parts={PLAN_PARTS}
        delayMs={520}
      />
    </div>
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
  const showAssembling = useMinimumVisible(plansQuery.isPending, ASSEMBLY_MIN_VISIBLE_MS)

  const listedPlans = (plansQuery.data?.plans ?? [])
    .filter((plan) => plan.kind === kind)
    .sort((left, right) =>
      localizedName(left, i18n.language).localeCompare(
        localizedName(right, i18n.language),
        i18n.language,
      ),
    )

  const currentId = currentQuery.data?.id
  const currentIsListed =
    currentId == null || listedPlans.some((plan) => plan.id === currentId)
  const showCustomNote = currentQuery.isSuccess && currentId != null && !currentIsListed

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
          <AssemblingPlans />
        ) : plansQuery.isError ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-6">
            <p className="text-sm text-destructive">{t("subscription.loadError")}</p>
            <Button type="button" variant="outline" onClick={() => void plansQuery.refetch()}>
              {t("subscription.retry")}
            </Button>
          </div>
        ) : listedPlans.length === 0 ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-6">
            <p className="text-sm text-muted-foreground">{t("subscription.emptyPlans")}</p>
            {showCustomNote ? (
              <p className="text-sm text-muted-foreground">{t("subscription.customNotListed")}</p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {showCustomNote ? (
              <p className="text-sm text-muted-foreground">{t("subscription.customNotListed")}</p>
            ) : null}
            {/* TODO: BACKEND_TODO — plan price is not on the catalog response. */}
            <div className="overflow-x-auto p-1">
              <table className="w-max border-separate border-spacing-3 text-left">
                <tbody>
                  <tr>
                    {listedPlans.map((plan) => {
                      const current = plan.id === currentId
                      const description = localizedDescription(plan, i18n.language)
                      return (
                        <td
                          key={plan.id}
                          aria-current={current ? "true" : undefined}
                          className="w-max max-w-72 align-top rounded-lg border border-border p-4"
                        >
                          <div
                            className={cn(
                              "flex max-w-64 flex-col gap-4",
                              kind === "account" ? "w-64" : "w-max",
                            )}
                          >
                            <div className={cn("flex flex-col gap-4", kind === "account" && "min-h-24")}>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-base font-semibold text-foreground">
                                  {localizedName(plan, i18n.language)}
                                </span>
                                {current ? (
                                  <Badge variant="active">{t("subscription.current")}</Badge>
                                ) : null}
                                {!plan.is_available ? (
                                  <Badge variant="destructive">{t("subscription.legacyPlan")}</Badge>
                                ) : null}
                              </div>
                              {description ? (
                                <p className="text-sm text-muted-foreground">{description}</p>
                              ) : null}
                            </div>
                            {kind === "account" ? (
                              <AccountPlanQuotas quotas={plan.quotas ?? []} />
                            ) : null}
                            {current ? null : (
                              <span className="relative mt-1 inline-flex w-full">
                                <Button type="button" className="w-full" disabled>
                                  {t("subscription.select")}
                                  <span className="sr-only">, {t("subscription.soon")}</span>
                                </Button>
                                <Badge
                                  variant="inactive"
                                  className="pointer-events-none absolute -right-2 -top-2 px-1.5"
                                >
                                  {t("subscription.soon")}
                                </Badge>
                              </span>
                            )}
                          </div>
                        </td>
                      )
                    })}
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
