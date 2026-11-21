import { useMatch, useParams, useSearchParams } from "react-router-dom"
import { SectionSidebar, type SidebarCollapseProps } from "./section-sidebar"
import {
  isProjectTab,
  projectTabIcon,
  PROJECT_TABS,
  type ProjectTab,
} from "@/features/projects/project-tabs"

const iconHoverClass: Record<ProjectTab, string> = {
  overview: "motion-safe:group-hover:-translate-y-px",
  models: "motion-safe:group-hover:-translate-y-px",
  databases: "group-hover:scale-[1.06] motion-safe:group-hover:-translate-y-0.5",
  "data-explorer": "group-hover:scale-[1.06] motion-safe:group-hover:-translate-y-0.5",
  secrets: "group-hover:scale-100 motion-safe:group-hover:-rotate-[18deg]",
  settings: "group-hover:scale-100 motion-safe:group-hover:rotate-[72deg]",
}

export function ProjectSidebar({
  collapsed = false,
  onToggleCollapsed,
}: SidebarCollapseProps) {
  const { id = "" } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const isDatabaseDetailsRoute =
    useMatch({ path: "/projects/:id/databases/:resourceId", end: false }) !== null
  const isMetricDetailsRoute = useMatch("/projects/:id/metrics/:metric") !== null
  const tabParam = searchParams.get("tab")
  const activeTab: ProjectTab = isDatabaseDetailsRoute
    ? "databases"
    : isMetricDetailsRoute
      ? "overview"
      : isProjectTab(tabParam)
        ? tabParam
        : "overview"

  const items = PROJECT_TABS.map((tab) => ({
    href: `/projects/${id}?tab=${tab}`,
    labelKey: tab === "data-explorer" ? "tabs.dataExplorer" : "tabs." + tab,
    icon: projectTabIcon[tab],
    iconClassName: iconHoverClass[tab],
    isActive: activeTab === tab,
    dividerBefore: tab === "settings",
  }))

  return (
    <SectionSidebar
      items={items}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
    />
  )
}
