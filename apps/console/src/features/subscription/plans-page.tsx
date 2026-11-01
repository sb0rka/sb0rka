import { Link, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Badge, Button, cn } from "@sb0rka/ui"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import { useAccountPlan, useProjectPlan, usePublicPlans } from "./hooks"
import { localizedDescription, localizedName } from "./quota-format"

function Pulse({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />
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
        {plansQuery.isPending ? (
          <div className="flex gap-3" aria-busy="true">
            <Pulse className="h-36 w-52" />
            <Pulse className="h-36 w-52" />
            <Pulse className="h-36 w-52" />
          </div>
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
            {/* TODO: BACKEND_TODO — price and included-quota rows need a per-plan pricing endpoint. */}
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
                          <div className="flex w-max max-w-64 flex-col gap-4">
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
