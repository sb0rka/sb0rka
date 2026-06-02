import { useEffect, useState } from "react"
import { Outlet, useMatch, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Sidebar } from "./sidebar"
import { ProjectSidebar } from "./project-sidebar"
import { Header } from "./header"
import { useDatabase, useProject, useSecrets } from "@/features/projects/hooks"
import { isProjectTab, type ProjectTab } from "@/features/projects/project-tabs"
type BreadcrumbItem = {
  label: string
  href?: string
}

const projectTabLabelKeyById: Record<ProjectTab, string> = {
  overview: "tabs.overview",
  databases: "tabs.databases",
  "data-explorer": "tabs.dataExplorer",
  secrets: "tabs.secrets",
  settings: "tabs.settings",
}

export function AppLayout() {
  const { t } = useTranslation()
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
    "data-explorer": t(projectTabLabelKeyById["data-explorer"]),
    secrets: t(projectTabLabelKeyById.secrets),
    settings: t(projectTabLabelKeyById.settings),
  }
  const breadcrumbs: BreadcrumbItem[] = isProjectOpen
    ? [
        { label: t("nav.projects"), href: "/projects" },
        { label: project?.name ?? t("projects.fallbackProject"), href: projectOverviewHref },
        ...(activeTab === "data-explorer"
          ? [
              {
                label: tabLabelById.databases,
                href: `/projects/${projectId}?tab=databases`,
              },
              { label: tabLabelById["data-explorer"] },
            ]
          : databaseDetailsMatch
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
    : [] // No breadcrumbs for non-project routes

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
        <main className="flex flex-1 flex-col overflow-auto bg-background p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
