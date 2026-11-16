import { useState } from "react"
import { Link } from "react-router-dom"
import { Trans, useTranslation } from "react-i18next"
import { Button } from "@sb0rka/ui"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import { useAuth } from "@/features/auth/auth-provider"
import { useProjects } from "@/features/projects/hooks"
import { isNotFound } from "./api"
import { ASSEMBLY_MIN_VISIBLE_MS, AssemblingLoader, useMinimumVisible } from "./components/assembling.tsx"
import { PlanHeroCard } from "./components/plan-hero-card"
import { ProjectPlanUsageCard } from "./components/project-plan-usage-card"
import { ProjectQuotasCard } from "./components/project-quotas-card"
import {
  useAccountBalance,
  useAccountPlan,
  useInitializeAccount,
  useProjectsQuotaOverview,
} from "./hooks"
import { localizedName } from "./quota-format"

function PageTitle({ planName }: { planName?: string }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const username = user?.username.trim()
  const plan = planName?.trim()

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">{t("subscription.title")}</h1>
        {username && plan ? (
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="subscription.onPlan"
              values={{ user: username, plan }}
              components={{
                user: <span className="font-bold text-foreground" />,
                plan: <span className="font-semibold text-[var(--subscription-plan)]" />,
              }}
            />
          </p>
        ) : null}
      </div>
      {plan ? (
        <Button asChild>
          <Link to="/subscription/plans">{t("subscription.changePlan")}</Link>
        </Button>
      ) : null}
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const showPlanAssembling = useMinimumVisible(planQuery.isPending, ASSEMBLY_MIN_VISIBLE_MS)
  const showProjectsAssembling = useMinimumVisible(projectsQuery.isPending, ASSEMBLY_MIN_VISIBLE_MS)

  const ordered = [...overview].sort((left, right) => {
    if (left.nearLimit !== right.nearLimit) return left.nearLimit ? -1 : 1
    return left.project.name.localeCompare(right.project.name, i18n.language)
  })
  const selected =
    ordered.find((view) => view.project.public_id === selectedId) ?? ordered[0] ?? null

  function selectProject(projectId: string) {
    setSelectedId(projectId)
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    document.getElementById("project-plan-usage")?.scrollIntoView({ behavior, block: "nearest" })
  }

  if (showPlanAssembling) {
    return (
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-4">
        <PageTitle />
        <AssemblingLoader className="min-h-0 flex-1 py-0" />
      </div>
    )
  }

  if (isNotFound(planQuery.error)) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
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
    <PageStagger className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-6">
      <SlideIn>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <PageTitle planName={localizedName(planQuery.data, i18n.language)} />
          <PlanHeroCard
            balance={balanceQuery.data}
            balanceLoading={balanceQuery.isPending}
            balanceError={balanceQuery.isError}
            onBalanceRetry={() => void balanceQuery.refetch()}
          />
        </div>
      </SlideIn>
      <SlideIn className="flex min-h-0 flex-1 flex-col">
        <section className="flex min-h-0 flex-1 flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("subscription.projectsTitle")}</h2>
          {showProjectsAssembling ? (
            <AssemblingLoader className="min-h-0 flex-1 py-0" />
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
            <div className="flex w-full min-w-0 flex-col items-stretch gap-8 md:flex-row md:flex-wrap md:items-start">
              <ul
                role="listbox"
                aria-label={t("subscription.projectsTitle")}
                className="grid w-full min-w-0 grid-cols-1 gap-3 md:w-[min(100%,32rem)] md:shrink-0"
              >
                {ordered.map((view) => (
                  <li key={view.project.public_id} role="presentation" className="min-w-0">
                    <ProjectQuotasCard
                      view={view}
                      selected={selected?.project.public_id === view.project.public_id}
                      onSelect={() => selectProject(view.project.public_id)}
                    />
                  </li>
                ))}
              </ul>
              {selected ? <ProjectPlanUsageCard view={selected} /> : null}
            </div>
          )}
        </section>
      </SlideIn>
    </PageStagger>
  )
}
