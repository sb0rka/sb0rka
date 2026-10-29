import { useState, useSyncExternalStore } from "react"
import { Outlet, useMatch, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Building2, Home } from "lucide-react"
import { Sidebar } from "./sidebar"
import { ProjectSidebar, projectTabIcon } from "./project-sidebar"
import { Header, type BreadcrumbItem } from "./header"
import { MobileRootNav } from "./mobile-root-nav"
import { LayoutProvider, useLayoutContext } from "./layout-context"
import { useDatabase, useProject, useSecrets } from "@/features/projects/hooks"
import { isProjectTab, type ProjectTab } from "@/features/projects/project-tabs"
import { useOrganization, useOrganizations } from "@/features/organizations/hooks"
import { ScrollArea } from "@sb0rka/ui"

const DATA_EXPLORER_NARROW_MAX_WIDTH = 1439

function useDataExplorerNarrowViewport() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mediaQueryList = window.matchMedia(
        `(max-width: ${DATA_EXPLORER_NARROW_MAX_WIDTH}px)`,
      )
      mediaQueryList.addEventListener("change", onStoreChange)
      return () => mediaQueryList.removeEventListener("change", onStoreChange)
    },
    () =>
      window.matchMedia(`(max-width: ${DATA_EXPLORER_NARROW_MAX_WIDTH}px)`).matches,
    () => false,
  )
}

const projectTabLabelKeyById: Record<ProjectTab, string> = {
  overview: "tabs.overview",
  databases: "tabs.databases",
  "data-explorer": "tabs.dataExplorer",
  secrets: "tabs.secrets",
  access: "tabs.access",
  settings: "tabs.settings",
}

export function AppLayout() {
  return (
    <LayoutProvider>
      <AppLayoutContent />
    </LayoutProvider>
  )
}

function AppLayoutContent() {
  const { t } = useTranslation()
  const { dataExplorerAiPanelOpen } = useLayoutContext()
  const isDataExplorerNarrowViewport = useDataExplorerNarrowViewport()
  const [searchParams] = useSearchParams()
  const isProjectRoot = useMatch("/projects/:id") !== null
  const isProjectNested = useMatch("/projects/:id/*") !== null
  const projectRootMatch = useMatch("/projects/:id")
  const projectNestedMatch = useMatch("/projects/:id/*")
  const databaseDetailsMatch = useMatch("/projects/:id/databases/:resourceId")
  const isProjectOpen = isProjectRoot || isProjectNested
  const organizationDetailMatch = useMatch("/organizations/:orgId")
  const organizationId = organizationDetailMatch?.params.orgId ?? ""
  const { data: organization } = useOrganization(organizationId)
  const { data: organizationsData } = useOrganizations()
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
      ? secretsData?.secrets.find((secret) => secret.secret_id === selectedSecretId)
      : undefined
  const activeProjectTabHref = `/projects/${projectId}?tab=${activeTab}`
  const projectOverviewHref = `/projects/${projectId}?tab=overview`
  const tabLabelById: Record<ProjectTab, string> = {
    overview: t(projectTabLabelKeyById.overview),
    databases: t(projectTabLabelKeyById.databases),
    "data-explorer": t(projectTabLabelKeyById["data-explorer"]),
    secrets: t(projectTabLabelKeyById.secrets),
    access: t(projectTabLabelKeyById.access),
    settings: t(projectTabLabelKeyById.settings),
  }
  const owningOrganization = (organizationsData?.organizations ?? []).find(
    (item) => item.id === project?.owner_subject_id,
  )
  const breadcrumbs: BreadcrumbItem[] = isProjectOpen
    ? [
        { label: t("nav.projects"), href: "/projects", icon: Home },
        ...(owningOrganization
          ? [
              {
                label: owningOrganization.name,
                href: `/organizations/${owningOrganization.id}`,
                icon: Building2,
              },
            ]
          : []),
        {
          label: project?.name ?? t("projects.fallbackProject"),
          href: projectOverviewHref,
        },
        ...(activeTab === "data-explorer"
          ? [
              {
                label: tabLabelById.databases,
                href: `/projects/${projectId}?tab=databases`,
                icon: projectTabIcon.databases,
              },
              {
                label: tabLabelById["data-explorer"],
                icon: projectTabIcon["data-explorer"],
              },
            ]
          : databaseDetailsMatch
            ? [
                {
                  label: tabLabelById.databases,
                  href: `/projects/${projectId}?tab=databases`,
                  icon: projectTabIcon.databases,
                },
                {
                  label: database?.name ?? resourceId ?? t("projects.fallbackResource"),
                },
              ]
            : activeTab === "secrets" && selectedSecretId
              ? [
                  {
                    label: tabLabelById.secrets,
                    href: `/projects/${projectId}?tab=secrets`,
                    icon: projectTabIcon.secrets,
                  },
                  {
                    label: selectedSecret?.name ?? selectedSecretId,
                  },
                ]
              : [
                  {
                    label: tabLabelById[activeTab],
                    href: activeProjectTabHref,
                    icon: projectTabIcon[activeTab],
                  },
                ]),
      ]
    : organizationDetailMatch
      ? [
          { label: t("nav.organizations"), href: "/organizations", icon: Building2 },
          { label: organization?.name ?? t("organizations.fallback") },
        ]
      : []

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [projectSidebarCollapsed, setProjectSidebarCollapsed] = useState(false)
  const autoCollapseProjectSidebar =
    activeTab === "data-explorer" &&
    dataExplorerAiPanelOpen &&
    isDataExplorerNarrowViewport

  return (
    <div className="flex min-h-dvh w-full md:h-screen">
      {!isProjectOpen && (
        <div className="hidden h-full md:block">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
          />
        </div>
      )}
      {isProjectOpen && (
        <div className="hidden h-full min-h-0 md:block">
          <ProjectSidebar
            collapsed={projectSidebarCollapsed || autoCollapseProjectSidebar}
            onToggleCollapsed={() => setProjectSidebarCollapsed((c) => !c)}
          />
        </div>
      )}
      <div className="md:hidden">
        <MobileRootNav />
      </div>
      <div className="flex min-w-0 flex-1 flex-col md:min-h-0">
        <div className="hidden md:block">
          <Header breadcrumbs={breadcrumbs} />
        </div>
        <main className="flex min-h-0 flex-1 flex-col bg-background">
          <ScrollArea type="always" 
            className="min-h-0 min-w-0 flex-1 [&_[data-radix-scroll-area-viewport]]:overflow-x-hidden [&_[data-radix-scroll-area-viewport]>div]:!flex [&_[data-radix-scroll-area-viewport]>div]:min-h-full"
          >
            <div className="flex min-h-full w-full flex-1 flex-col px-4 md:p-6 pb-[calc(5.75rem+env(safe-area-inset-bottom))] pt-[calc(4.75rem+env(safe-area-inset-top))]">
              <Outlet />
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  )
}
