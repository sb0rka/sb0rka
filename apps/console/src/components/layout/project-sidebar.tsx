import type { ComponentType } from "react"
import { Link, useMatch, useParams, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  BarChart3,
  Cpu,
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
  dividerClass,
  navIconClass,
  rowChromeClass,
  sidebarIconSlotClass,
  SidebarItem,
} from "@sb0rka/ui"
import { isProjectTab, type ProjectTab } from "@/features/projects/project-tabs"
import { SidebarLogo } from "@/components/layout/sidebar-logo"

type ProjectTabIcon = ComponentType<{ className?: string }>

type ProjectNavIconAnimation = "chart" | "database" | "key" | "settings"

export const projectTabIcon = {
  overview: BarChart3,
  models: Cpu,
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
  { key: "models", tab: "models", labelKey: "tabs.models", icon: projectTabIcon.models, iconAnimation: "chart" as const },
  { key: "databases", tab: "databases", labelKey: "tabs.databases", icon: projectTabIcon.databases, iconAnimation: "database" as const },
  { key: "data-explorer", tab: "data-explorer", labelKey: "tabs.dataExplorer", icon: projectTabIcon["data-explorer"], iconAnimation: "database" as const },
  { key: "secrets", tab: "secrets", labelKey: "tabs.secrets", icon: projectTabIcon.secrets, iconAnimation: "key" as const },
]

const iconHoverClass: Record<ProjectNavIconAnimation, string> = {
  chart: "motion-safe:group-hover:-translate-y-px",
  database: "group-hover:scale-[1.06] motion-safe:group-hover:-translate-y-0.5",
  key: "group-hover:scale-100 motion-safe:group-hover:-rotate-[18deg]",
  settings: "group-hover:scale-100 motion-safe:group-hover:rotate-[72deg]",
}

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
        "relative flex h-full shrink-0 flex-col justify-between overflow-hidden bg-[var(--sidebar-bg)] transition-[width] duration-[400ms] ease-out",
        collapsed ? "w-[60px] [--sidebar-nav-pl:0.5rem]" : "w-[200px] [--sidebar-nav-pl:1rem]",
      )}
    >
      <div
        className="pointer-events-none absolute bottom-0 right-0 top-[var(--app-header-height)] w-px bg-border"
        aria-hidden
      />
      <div className="flex flex-col gap-2">
        <SidebarLogo collapsed={collapsed} />
        <nav className="flex flex-col gap-3 px-[var(--sidebar-nav-pl)]">
          {projectNavItems.map((item) => (
            <SidebarItem
              key={item.tab}
              asChild
              icon={item.icon}
              iconClassName={iconHoverClass[item.iconAnimation]}
              label={t(item.labelKey)}
              active={activeTab === item.tab}
              collapsed={collapsed}
            >
              <Link to={getTabHref(item.tab)} />
            </SidebarItem>
          ))}

          <div className="relative h-px w-full">
            <Separator className={dividerClass(collapsed)} />
          </div>

          <SidebarItem
            asChild
            icon={settingsNavItem.icon}
            iconClassName={iconHoverClass[settingsNavItem.iconAnimation]}
            label={t(settingsNavItem.labelKey)}
            active={activeTab === settingsNavItem.tab}
            collapsed={collapsed}
          >
            <Link to={getTabHref(settingsNavItem.tab)} />
          </SidebarItem>
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
