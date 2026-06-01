import type { ComponentType } from "react"
import { Link, useMatch, useParams, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  BarChart3,
  Check,
  ChevronsUpDown,
  Database,
  KeyRound,
  Settings,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { useProject, useProjects } from "@/features/projects/hooks"
import {
  ProjectNavLink,
  type ProjectNavIconAnimation,
} from "@/components/layout/project-nav-icon"

type ProjectTab = "overview" | "databases" | "secrets" | "settings"

const projectNavItems: Array<{
  labelKey: string
  icon: ComponentType<{ className?: string }>
  tab: ProjectTab
  iconAnimation: ProjectNavIconAnimation
}> = [
  { labelKey: "tabs.overview", icon: BarChart3, tab: "overview", iconAnimation: "chart" },
  { labelKey: "tabs.databases", icon: Database, tab: "databases", iconAnimation: "database" },
  { labelKey: "tabs.secrets", icon: KeyRound, tab: "secrets", iconAnimation: "key" },
]

const settingsNavItem = {
  labelKey: "tabs.settings",
  icon: Settings,
  tab: "settings" as const,
  iconAnimation: "settings" as const,
}

export function ProjectSidebar() {
  const { t } = useTranslation()
  const { id = "" } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const isDatabaseDetailsRoute = useMatch("/projects/:id/databases/:resourceId") !== null
  const isMetricDetailsRoute = useMatch("/projects/:id/metrics/:metric") !== null
  const { data: project } = useProject(id)
  const { data: projectsData } = useProjects()
  const tabParam = searchParams.get("tab")
  const isProjectTab = (value: string | null): value is ProjectTab =>
    value === "overview" ||
    value === "databases" ||
    value === "secrets" ||
    value === "settings"
  const activeTab: ProjectTab = isDatabaseDetailsRoute
    ? "databases"
    : isMetricDetailsRoute
      ? "overview"
    : isProjectTab(tabParam)
      ? tabParam
      : "overview"
  const projects = projectsData?.projects ?? []

  const getTabHref = (tab: ProjectTab) => `/projects/${id}?tab=${tab}`
  const getProjectHref = (projectId: string) => `/projects/${projectId}?tab=${activeTab}`

  return (
    <aside className="flex h-full w-[175px] shrink-0 flex-col border-r border-border bg-[var(--sidebar-bg)]">
      <div className="border-b border-border p-2.5 h-[60px]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-10 w-full justify-between gap-2 px-3 font-medium"
            >
              <span className="truncate">{project?.name ?? t("projects.fallbackProject")}</span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[220px]">
            <DropdownMenuItem asChild>
              <Link to="/projects" className="w-full">
                {t("projects.allProjects")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {projects.length === 0 ? (
              <DropdownMenuItem disabled>{t("projects.noProjects")}</DropdownMenuItem>
            ) : (
              projects.map((projectItem) => {
                const isCurrentProject = projectItem.id === id
                return (
                  <DropdownMenuItem key={projectItem.id} asChild>
                    <Link
                      to={getProjectHref(projectItem.id)}
                      className="flex w-full items-center justify-between gap-2"
                    >
                      <span className="truncate">{projectItem.name}</span>
                      {isCurrentProject ? (
                        <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : null}
                    </Link>
                  </DropdownMenuItem>
                )
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <nav className="flex flex-col gap-3 px-4 py-3">
        {projectNavItems.map((item) => (
          <ProjectNavLink
            key={item.tab}
            to={getTabHref(item.tab)}
            isActive={activeTab === item.tab}
            icon={item.icon}
            animation={item.iconAnimation}
          >
            {t(item.labelKey)}
          </ProjectNavLink>
        ))}

        <Separator />

        <ProjectNavLink
          to={getTabHref(settingsNavItem.tab)}
          isActive={activeTab === settingsNavItem.tab}
          icon={settingsNavItem.icon}
          animation={settingsNavItem.iconAnimation}
        >
          {t(settingsNavItem.labelKey)}
        </ProjectNavLink>
      </nav>
    </aside>
  )
}
