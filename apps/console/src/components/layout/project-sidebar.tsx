import type { ComponentType } from "react"
import { Link, useMatch, useParams, useSearchParams } from "react-router-dom"
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
import { cn } from "@/lib/utils"
import { useProject, useProjects } from "@/features/projects/hooks"

type ProjectTab = "overview" | "databases" | "secrets" | "settings"

const projectNavItems: Array<{
  label: string
  icon: ComponentType<{ className?: string }>
  tab: ProjectTab
}> = [
  { label: "Главная", icon: BarChart3, tab: "overview" },
  { label: "Базы данных", icon: Database, tab: "databases" },
  { label: "Секреты", icon: KeyRound, tab: "secrets" },
]

const settingsNavItem = {
  label: "Настройки",
  icon: Settings,
  tab: "settings" as const,
}

export function ProjectSidebar() {
  const { id = "" } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const isDatabaseDetailsRoute = useMatch("/projects/:id/databases/:resourceId") !== null
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
    : isProjectTab(tabParam)
      ? tabParam
      : "overview"
  const projects = projectsData?.projects ?? []

  const getTabHref = (tab: ProjectTab) => `/projects/${id}?tab=${tab}`
  const getProjectHref = (projectId: string) => `/projects/${projectId}?tab=${activeTab}`

  return (
    <aside className="flex h-full w-[175px] shrink-0 flex-col border-r border-border bg-[var(--sidebar-bg)]">
      <div className="border-b border-border p-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-10 w-full justify-between gap-2 px-3 font-medium"
            >
              <span className="truncate">{project?.name ?? "Project"}</span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[220px]">
            <DropdownMenuItem asChild>
              <Link to="/projects" className="w-full">
                Все проекты
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {projects.length === 0 ? (
              <DropdownMenuItem disabled>Нет проектов</DropdownMenuItem>
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
          const isActive = activeTab === item.tab
          return (
            <Link
              key={item.tab}
              to={getTabHref(item.tab)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
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
          {settingsNavItem.label}
        </Link>
      </nav>
    </aside>
  )
}
