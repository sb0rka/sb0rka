import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button, cn } from "@sb0rka/ui"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import { useProjects } from "@/features/projects/hooks"
import { isNotFound } from "./api"
import { AttentionStrip } from "./components/attention-strip"
import { BalanceSection } from "./components/balance-section"
import { PlanHeroCard } from "./components/plan-hero-card"
import { ProjectQuotasCard } from "./components/project-quotas-card"
import {
  useAccountBalance,
  useAccountPlan,
  useInitializeAccount,
  useProjectsQuotaOverview,
} from "./hooks"

function Pulse({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />
}

function PageTitle() {
  const { t } = useTranslation()
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold text-foreground">{t("subscription.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("subscription.description")}</p>
    </div>
  )
}

export function SubscriptionPage() {
  const { t, i18n } = useTranslation()
  const planQuery = useAccountPlan()
  const balanceQuery = useAccountBalance()
  const projectsQuery = useProjects()
  const projects = projectsQuery.data?.projects ?? []
  const overview = useProjectsQuotaOverview(projects)
  const initialize = useInitializeAccount()

  const ordered = [...overview].sort((left, right) => {
    if (left.nearLimit !== right.nearLimit) return left.nearLimit ? -1 : 1
    return left.project.name.localeCompare(right.project.name, i18n.language)
  })
  const overviewReady = !projectsQuery.isPending && ordered.every((view) => !view.loading)
  const rows = ordered.flatMap((view) => view.rows)

  if (planQuery.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <PageTitle />
        <Pulse className="h-36" />
        <Pulse className="h-24" />
        <Pulse className="h-28" />
      </div>
    )
  }

  if (isNotFound(planQuery.error)) {
    return (
      <div className="flex flex-col gap-4">
        <PageTitle />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-border px-6 py-16 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">{t("subscription.notInitializedTitle")}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {t("subscription.notInitializedDescription")}
          </p>
          <Button
            type="button"
            className="mt-2"
            disabled={initialize.isPending}
            onClick={() => initialize.mutate()}
          >
            {initialize.isPending ? t("subscription.initializing") : t("subscription.initialize")}
          </Button>
          {initialize.isError ? (
            <p className="text-sm text-destructive">{t("subscription.initializeError")}</p>
          ) : null}
        </div>
      </div>
    )
  }

  if (planQuery.isError || !planQuery.data) {
    return (
      <div className="flex flex-col gap-4">
        <PageTitle />
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-6">
          <p className="text-sm text-destructive">{t("subscription.loadError")}</p>
          <Button type="button" variant="outline" onClick={() => void planQuery.refetch()}>
            {t("subscription.retry")}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <PageStagger className="flex flex-col gap-6">
      <SlideIn>
        <PageTitle />
      </SlideIn>
      <SlideIn>
        <PlanHeroCard plan={planQuery.data} />
      </SlideIn>
      <SlideIn>
        <AttentionStrip
          views={ordered}
          balance={balanceQuery.data ?? null}
          ready={overviewReady && !balanceQuery.isPending}
        />
      </SlideIn>
      <SlideIn>
        <BalanceSection
          balance={balanceQuery.data}
          rows={rows}
          isLoading={balanceQuery.isPending}
          isError={balanceQuery.isError}
          onRetry={() => void balanceQuery.refetch()}
        />
      </SlideIn>
      <SlideIn>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("subscription.projectsTitle")}</h2>
          {projectsQuery.isPending ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              <Pulse className="h-24" />
              <Pulse className="h-24" />
            </div>
          ) : projectsQuery.isError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
              <p className="text-sm text-destructive">{t("subscription.projectsError")}</p>
              <Button type="button" variant="outline" onClick={() => void projectsQuery.refetch()}>
                {t("subscription.retry")}
              </Button>
            </div>
          ) : ordered.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-6">
              <p className="text-sm text-muted-foreground">{t("subscription.projectsEmpty")}</p>
              <Button asChild>
                <Link to="/projects">{t("subscription.projectsEmptyAction")}</Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {ordered.map((view) => (
                <ProjectQuotasCard key={view.project.public_id} view={view} />
              ))}
            </div>
          )}
        </section>
      </SlideIn>
    </PageStagger>
  )
}
