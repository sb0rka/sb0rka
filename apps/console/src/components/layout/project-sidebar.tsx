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
  PanelLeft,
  Settings,
} from "lucide-react"
import { Button, buttonPressClass } from "@/components/ui/button"
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
import { isProjectTab, type ProjectTab } from "@/features/projects/project-tabs"
import { cn } from "@/lib/utils"
import {
  dividerClass,
  navIconClass,
  rowChromeClass,
  sidebarIconSlotClass,
} from "@/components/layout/sidebar-rail"

type ProjectNavItem = {
  key: string
  tab: ProjectTab
  labelKey: string
  icon: ComponentType<{ className?: string }>
  iconAnimation: ProjectNavIconAnimation
}

const projectNavItems: ProjectNavItem[] = [
  { key: "overview", tab: "overview", labelKey: "tabs.overview", icon: BarChart3, iconAnimation: "chart" as const },
  { key: "databases", tab: "databases", labelKey: "tabs.databases", icon: Database, iconAnimation: "database" as const },
  { key: "data-explorer", tab: "data-explorer", labelKey: "tabs.dataExplorer", icon: LayoutGrid, iconAnimation: "database" as const },
  { key: "secrets", tab: "secrets", labelKey: "tabs.secrets", icon: KeyRound, iconAnimation: "key" as const },
]

const settingsNavItem = {
  labelKey: "tabs.settings",
  icon: Settings,
  tab: "settings" as const,
  iconAnimation: "settings" as const,
}

/** Centered in collapsed header — same anchor as main sidebar logo mark. */
const projectSwitcherCollapsedClass =
  "absolute top-1/2 left-[30px] h-9 w-9 -translate-x-1/2 -translate-y-1/2"

/** Expanded trigger — vertically centered in header, aligned with nav rail. */
const projectSwitcherExpandedClass =
  "absolute top-1/2 right-4 left-[calc(30px-12.5px)] h-10 -translate-y-1/2 justify-between gap-2 px-3 font-medium"

interface ProjectSidebarProps {
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export function ProjectSidebar({
  collapsed = false,
  onToggleCollapsed,
}: ProjectSidebarProps) {
  const { t } = useTranslation()
  const { id = "" } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const isDatabaseDetailsRoute =
    useMatch({ path: "/projects/:id/databases/:resourceId", end: false }) !== null
  const isMetricDetailsRoute = useMatch("/projects/:id/metrics/:metric") !== null
  const { data: project } = useProject(id)
  const { data: projectsData } = useProjects()
  const tabParam = searchParams.get("tab")
  const activeTab: ProjectTab = isDatabaseDetailsRoute
    ? "databases"
    : isMetricDetailsRoute ? "overview"
    : isProjectTab(tabParam) ? tabParam
    : "overview"
  const projects = projectsData?.projects ?? []

  const getTabHref = (tab: ProjectTab) => `/projects/${id}?tab=${tab}`
  const getProjectHref = (projectId: string) => `/projects/${projectId}?tab=${activeTab}`

  const projectSwitcherMenu = (
  <>
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
  </>
  )

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col justify-between overflow-hidden border-r border-border bg-[var(--sidebar-bg)] transition-[width] duration-[400ms] ease-out",
        collapsed ? "w-[60px] [--sidebar-nav-pl:0.5rem]" : "w-[200px] [--sidebar-nav-pl:1rem]",
      )}
    >
      <div className="flex flex-col gap-2">
        <div className="relative h-[60px] overflow-hidden border-b border-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size={collapsed ? "icon" : "default"}
                className={cn(
                  collapsed ? projectSwitcherCollapsedClass : projectSwitcherExpandedClass,
                )}
                title={collapsed ? (project?.name ?? t("projects.fallbackProject")) : undefined}
              >
                {collapsed ? (
                  <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <>
                    <span className="truncate">{project?.name ?? t("projects.fallbackProject")}</span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[220px]">
              {projectSwitcherMenu}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <nav className="flex flex-col gap-3 px-[var(--sidebar-nav-pl)]">
          {projectNavItems.map((item) => (
            <ProjectNavLink
              key={item.tab}
              to={getTabHref(item.tab)}
              isActive={activeTab === item.tab}
              icon={item.icon}
              animation={item.iconAnimation}
              collapsed={collapsed}
            >
              {t(item.labelKey)}
            </ProjectNavLink>
          ))}

          <div className="relative h-px w-full">
            <Separator className={dividerClass(collapsed)} />
          </div>

          <ProjectNavLink
            to={getTabHref(settingsNavItem.tab)}
            isActive={activeTab === settingsNavItem.tab}
            icon={settingsNavItem.icon}
            animation={settingsNavItem.iconAnimation}
            collapsed={collapsed}
          >
            {t(settingsNavItem.labelKey)}
          </ProjectNavLink>
        </nav>
      </div>

      <div className="flex flex-col gap-3 px-[var(--sidebar-nav-pl)] py-4">
        <div className="relative h-px w-full">
          <Separator className={dividerClass(collapsed)} />
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={cn(
            "group relative block h-9 w-full rounded-lg text-muted-foreground hover:text-foreground",
            buttonPressClass,
          )}
          aria-label={
            collapsed
              ? t("nav.expandSidebar")
              : t("nav.collapseSidebar")
          }
        >
          <span
            className={cn(rowChromeClass(collapsed), "group-hover:bg-muted/50")}
            aria-hidden
          />
          <span className={sidebarIconSlotClass}>
            <PanelLeft className={navIconClass} />
          </span>
        </button>
      </div>
    </aside>
  )
}
