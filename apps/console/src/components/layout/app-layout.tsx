import { useEffect, useState } from "react"
import { Outlet, useLocation, useMatch, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Sidebar } from "./sidebar"
import { ProjectSidebar } from "./project-sidebar"
import { Header } from "./header"
import { useDatabase, useProject, useSecrets } from "@/features/projects/hooks"

type ProjectTab = "overview" | "databases" | "secrets" | "settings"
type BreadcrumbItem = {
  label: string
  href?: string
}

const projectTabLabelKeyById: Record<ProjectTab, string> = {
  overview: "tabs.overview",
  databases: "tabs.databases",
  secrets: "tabs.secrets",
  settings: "tabs.settings",
}

const isProjectTab = (value: string | null): value is ProjectTab =>
  value === "overview" ||
  value === "databases" ||
  value === "secrets" ||
  value === "settings"

function breadcrumbsForPath(pathname: string, t: (key: string) => string) {
  if (pathname.startsWith("/subscription")) {
    return [{ label: "sb0rka", href: "/projects" }, { label: t("nav.subscription") }]
  }
  if (pathname.startsWith("/profile")) {
    return [{ label: "sb0rka", href: "/projects" }, { label: t("nav.profile") }]
  }
  return [{ label: "sb0rka", href: "/projects" }, { label: t("nav.projects") }]
}

export function AppLayout() {
  const { t } = useTranslation()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const isProjectRoot = useMatch("/projects/:id") !== null
  const isProjectNested = useMatch("/projects/:id/*") !== null
  const projectRootMatch = useMatch("/projects/:id")
  const projectNestedMatch = useMatch("/projects/:id/*")
  const databaseDetailsMatch = useMatch("/projects/:id/databases/:resourceId")
  const isProjectOpen = isProjectRoot || isProjectNested
  const projectId =
    databaseDetailsMatch?.params.id ??
    projectNestedMatch?.params.id ??
    projectRootMatch?.params.id ??
    ""
  const resourceId = databaseDetailsMatch?.params.resourceId?.trim()
  const tabParam = searchParams.get("tab")
  const activeTab: ProjectTab = databaseDetailsMatch
    ? "databases"
    : isProjectTab(tabParam)
      ? tabParam
      : "overview"
  const { data: project } = useProject(projectId)
  const { data: database } = useDatabase(projectId, resourceId)
  const { data: secretsData } = useSecrets(projectId)
  const selectedSecretId = searchParams.get("secret")?.trim()
  const selectedSecret =
    selectedSecretId && activeTab === "secrets"
      ? secretsData?.secrets.find((secret) => secret.resource_id === selectedSecretId)
      : undefined
  const activeProjectTabHref = `/projects/${projectId}?tab=${activeTab}`
  const projectOverviewHref = `/projects/${projectId}?tab=overview`
  const tabLabelById: Record<ProjectTab, string> = {
    overview: t(projectTabLabelKeyById.overview),
    databases: t(projectTabLabelKeyById.databases),
    secrets: t(projectTabLabelKeyById.secrets),
    settings: t(projectTabLabelKeyById.settings),
  }
  const breadcrumbs: BreadcrumbItem[] = isProjectOpen
    ? [
        { label: "sb0rka", href: "/projects" },
        { label: t("nav.projects"), href: "/projects" },
        { label: project?.name ?? t("projects.fallbackProject"), href: projectOverviewHref },
        ...(databaseDetailsMatch
          ? [
              {
                label: tabLabelById.databases,
                href: `/projects/${projectId}?tab=databases`,
              },
              { label: database?.name ?? resourceId ?? t("projects.fallbackResource") },
            ]
          : activeTab === "secrets" && selectedSecretId
            ? [
                {
                  label: tabLabelById.secrets,
                  href: `/projects/${projectId}?tab=secrets`,
                },
                { label: selectedSecret?.name ?? selectedSecretId },
              ]
            : [{ label: tabLabelById[activeTab], href: activeProjectTabHref }]),
      ]
    : breadcrumbsForPath(location.pathname, t)

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    setSidebarCollapsed(isProjectOpen)
  }, [isProjectOpen])

  return (
    <div className="flex h-screen w-full">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
      />
      {isProjectOpen && <ProjectSidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header breadcrumbs={breadcrumbs} />
        <main className="flex-1 overflow-auto bg-background p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
