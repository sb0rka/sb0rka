import type { ComponentType } from "react"
import { Link, useMatch, useParams, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  BarChart3,
  Check,
  ChevronsUpDown,
  Database,
  KeyRound,
  LayoutGrid,
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
import { cn } from "@/lib/utils"
import { useProject, useProjects } from "@/features/projects/hooks"

type ProjectTab = "overview" | "databases" | "secrets" | "settings"

type ProjectNavItem =
  | {
      key: string
      kind: "tab"
      tab: ProjectTab
      labelKey: string
      icon: ComponentType<{ className?: string }>
    }
  | {
      key: string
      kind: "data-explorer"
      labelKey: string
      icon: ComponentType<{ className?: string }>
    }

const projectNavItems: ProjectNavItem[] = [
  { key: "overview", kind: "tab", tab: "overview", labelKey: "tabs.overview", icon: BarChart3 },
  { key: "databases", kind: "tab", tab: "databases", labelKey: "tabs.databases", icon: Database },
  {
    key: "data-explorer",
    kind: "data-explorer",
    labelKey: "dataExplorer.nav",
    icon: LayoutGrid,
  },
  { key: "secrets", kind: "tab", tab: "secrets", labelKey: "tabs.secrets", icon: KeyRound },
]

const settingsNavItem = {
  labelKey: "tabs.settings",
  icon: Settings,
  tab: "settings" as const,
}

export function ProjectSidebar() {
  const { t } = useTranslation()
  const { id = "" } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const isDatabaseDetailsRoute =
    useMatch({ path: "/projects/:id/databases/:resourceId", end: false }) !== null
  const isDataExplorerRoute = useMatch("/projects/:id/data-explorer") !== null
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
  const getProjectHref = (projectId: string) =>
    isDataExplorerRoute
      ? `/projects/${projectId}/data-explorer`
      : `/projects/${projectId}?tab=${activeTab}`

  return (
    <aside className="flex h-full w-[200px] shrink-0 flex-col border-r border-border bg-[var(--sidebar-bg)]">
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
        {projectNavItems.map((item) => {
          const href =
            item.kind === "tab"
              ? getTabHref(item.tab)
              : `/projects/${id}/data-explorer`
          const isActive =
            item.kind === "tab"
              ? activeTab === item.tab && !isDataExplorerRoute
              : isDataExplorerRoute
          const Icon = item.icon
          return (
            <Link
              key={item.key}
              to={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {t(item.labelKey)}
            </Link>
          )
        })}

        <Separator />

        <Link
          to={getTabHref(settingsNavItem.tab)}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            activeTab === settingsNavItem.tab
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          <settingsNavItem.icon className="h-4 w-4" />
          {t(settingsNavItem.labelKey)}
        </Link>
      </nav>
    </aside>
  )
}
