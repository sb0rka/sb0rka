import type { ComponentType } from "react"
import { useMatch, useParams, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  BarChart3,
  Database,
  KeyRound,
  LayoutGrid,
  PanelLeft,
  Settings,
} from "lucide-react"
import {
  buttonPressClass,
  cn,
  Separator,
} from "@sb0rka/ui"
import {
  ProjectNavLink,
  type ProjectNavIconAnimation,
} from "@/components/layout/project-nav-icon"
import { isProjectTab, type ProjectTab } from "@/features/projects/project-tabs"
import {
  dividerClass,
  navIconClass,
  rowChromeClass,
  sidebarIconSlotClass,
} from "@/components/layout/sidebar-rail"

type ProjectTabIcon = ComponentType<{ className?: string }>

export const projectTabIcon = {
  overview: BarChart3,
  databases: Database,
  "data-explorer": LayoutGrid,
  secrets: KeyRound,
  settings: Settings,
} as const satisfies Record<ProjectTab, ProjectTabIcon>

type ProjectNavItem = {
  key: string
  tab: ProjectTab
  labelKey: string
  icon: ProjectTabIcon
  iconAnimation: ProjectNavIconAnimation
}

const projectNavItems: ProjectNavItem[] = [
  { key: "overview", tab: "overview", labelKey: "tabs.overview", icon: projectTabIcon.overview, iconAnimation: "chart" as const },
  { key: "databases", tab: "databases", labelKey: "tabs.databases", icon: projectTabIcon.databases, iconAnimation: "database" as const },
  { key: "data-explorer", tab: "data-explorer", labelKey: "tabs.dataExplorer", icon: projectTabIcon["data-explorer"], iconAnimation: "database" as const },
  { key: "secrets", tab: "secrets", labelKey: "tabs.secrets", icon: projectTabIcon.secrets, iconAnimation: "key" as const },
]

const settingsNavItem = {
  labelKey: "tabs.settings",
  icon: projectTabIcon.settings,
  tab: "settings" as const,
  iconAnimation: "settings" as const,
}

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
  const tabParam = searchParams.get("tab")
  const activeTab: ProjectTab = isDatabaseDetailsRoute
    ? "databases"
    : isMetricDetailsRoute ? "overview"
    : isProjectTab(tabParam) ? tabParam
    : "overview"

  const getTabHref = (tab: ProjectTab) => `/projects/${id}?tab=${tab}`

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col justify-between overflow-hidden border-r border-border bg-[var(--sidebar-bg)] transition-[width] duration-[400ms] ease-out",
        collapsed ? "w-[60px] [--sidebar-nav-pl:0.5rem]" : "w-[200px] [--sidebar-nav-pl:1rem]",
      )}
    >
      <nav className="flex flex-col gap-3 px-[var(--sidebar-nav-pl)] pt-2">
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
