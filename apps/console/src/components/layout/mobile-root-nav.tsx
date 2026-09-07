import type { ComponentType } from "react"
import { Link, useLocation, useMatch, useSearchParams } from "react-router-dom"
import { BarChart3, Database, Home, KeyRound, RussianRuble, User } from "lucide-react"
import { useTranslation } from "react-i18next"
import { SborkaLogoMark, SborkaLogoWordmarkText } from "@/components/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSwitcher } from "@/components/language-switcher"
import { Badge } from "@/components/ui/badge"
import { Button, buttonPressClass } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/features/auth/auth-provider"
import { useLogout } from "@/features/auth/hooks"
import { useDatabase, useProject, useSecrets } from "@/features/projects/hooks"
import { isProjectTab, type ProjectTab } from "@/features/projects/project-tabs"
import { cn } from "@/lib/utils"

const projectTabLabelKeyById: Record<ProjectTab, string> = {
  overview: "tabs.overview",
  databases: "tabs.databases",
  "data-explorer": "tabs.dataExplorer",
  secrets: "tabs.secrets",
  settings: "tabs.settings",
}

type MobileNavItem = {
  labelKey?: string
  label?: string
  icon?: ComponentType<{ className?: string }>
  href: string
  isActive: boolean
}

const rootMobileNavItems = [
  { labelKey: "nav.projects", icon: Home, href: "/projects" },
  { labelKey: "nav.subscription", icon: RussianRuble, href: "/subscription" },
  { labelKey: "nav.profile", icon: User, href: "/profile" },
] as const

function useMobileProjectContext() {
  const [searchParams] = useSearchParams()
  const databaseQueryMatch = useMatch("/projects/:id/databases/:resourceId/query")
  const databaseDetailsMatch = useMatch({
    path: "/projects/:id/databases/:resourceId",
    end: true,
  })
  const databaseRouteMatch = useMatch({ path: "/projects/:id/databases/:resourceId", end: false })
  const metricDetailsMatch = useMatch("/projects/:id/metrics/:metric")
  const projectMatch = useMatch({ path: "/projects/:id", end: true })
  const projectNestedMatch = useMatch("/projects/:id/*")

  const isProjectView = projectMatch !== null || projectNestedMatch !== null
  const projectId = isProjectView
    ? (databaseQueryMatch?.params.id ??
      databaseDetailsMatch?.params.id ??
      metricDetailsMatch?.params.id ??
      projectNestedMatch?.params.id ??
      projectMatch?.params.id ??
      "")
    : ""

  const tabParam = searchParams.get("tab")
  const activeTab: ProjectTab = databaseRouteMatch
    ? "databases"
    : metricDetailsMatch
      ? "overview"
      : isProjectTab(tabParam)
        ? tabParam
        : "overview"

  return {
    projectId,
    isProjectView,
    activeTab,
    databaseQueryMatch,
    databaseDetailsMatch,
    metricDetailsMatch,
    projectMatch,
  }
}

function useMobileProjectHeader() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const {
    projectId,
    isProjectView,
    activeTab,
    databaseQueryMatch,
    databaseDetailsMatch,
    metricDetailsMatch,
    projectMatch,
  } = useMobileProjectContext()
  const resourceId =
    databaseQueryMatch?.params.resourceId?.trim() ??
    databaseDetailsMatch?.params.resourceId?.trim()

  const { data: project } = useProject(projectId)
  const { data: database } = useDatabase(projectId, resourceId)
  const { data: secretsData } = useSecrets(projectId)

  if (!isProjectView) {
    return null
  }

  if (databaseQueryMatch) {
    return {
      backHref: `/projects/${projectId}/databases/${resourceId}`,
      backLabel: t("databaseQuery.backToDatabase"),
      title: database?.name ?? t("projects.fallbackResource"),
    }
  }

  if (databaseDetailsMatch) {
    return {
      backHref: `/projects/${projectId}?tab=databases`,
      backLabel: t("databases.backToList"),
      title: database?.name ?? resourceId ?? t("projects.fallbackResource"),
    }
  }

  if (metricDetailsMatch) {
    return {
      backHref: `/projects/${projectId}?tab=overview`,
      backLabel: t("metrics.backToOverview"),
      title: project?.name ?? t("projects.fallbackProject"),
    }
  }

  if (projectMatch) {
    const selectedSecretId = searchParams.get("secret")?.trim()

    if (activeTab === "secrets" && selectedSecretId) {
      const selectedSecret = secretsData?.secrets.find(
        (secret) => secret.secret_id === selectedSecretId,
      )
      return {
        backHref: `/projects/${projectId}?tab=secrets`,
        backLabel: t("tabs.secrets"),
        title: selectedSecret?.name ?? selectedSecretId,
      }
    }

    if (activeTab !== "overview") {
      const backTabByActiveTab: Partial<Record<ProjectTab, ProjectTab>> = {
        databases: "overview",
        secrets: "overview",
        settings: "overview",
        "data-explorer": "databases",
      }
      const backTab = backTabByActiveTab[activeTab] ?? "overview"

      return {
        backHref: `/projects/${projectId}?tab=${backTab}`,
        backLabel:
          backTab === "overview"
            ? t("metrics.backToOverview")
            : backTab === "databases"
              ? t("databases.backToList")
              : t(projectTabLabelKeyById[backTab]),
        title: t(projectTabLabelKeyById[activeTab]),
      }
    }
  }

  return {
    backHref: "/projects",
    backLabel: t("projects.allProjects"),
    title: project?.name ?? t("projects.fallbackProject"),
  }
}

function useMobileNavItems(): MobileNavItem[] {
  const location = useLocation()
  const {
    projectId,
    isProjectView,
    activeTab,
    databaseQueryMatch,
    databaseDetailsMatch,
    metricDetailsMatch,
  } = useMobileProjectContext()

  if (!isProjectView || !projectId) {
    return rootMobileNavItems.map((item) => ({
      ...item,
      isActive:
        item.href === "/projects"
          ? location.pathname === "/projects" ||
            location.pathname.startsWith("/projects/")
          : location.pathname === item.href,
    }))
  }

  const isDatabasesActive =
    activeTab === "databases" ||
    activeTab === "data-explorer" ||
    databaseDetailsMatch !== null ||
    databaseQueryMatch !== null

  return [
    {
      labelKey: "tabs.overview",
      icon: BarChart3,
      href: `/projects/${projectId}?tab=overview`,
      isActive:
        activeTab === "overview" ||
        activeTab === "settings" ||
        metricDetailsMatch !== null,
    },
    {
      labelKey: "tabs.databases",
      icon: Database,
      href: `/projects/${projectId}?tab=databases`,
      isActive: isDatabasesActive,
    },
    {
      labelKey: "tabs.secrets",
      icon: KeyRound,
      href: `/projects/${projectId}?tab=secrets`,
      isActive: activeTab === "secrets",
    },
  ]
}

export function MobileRootNav() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const logoutMutation = useLogout()
  const projectHeader = useMobileProjectHeader()
  const mobileNavItems = useMobileNavItems()

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-[var(--mobile-chrome-bg)] px-4 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="flex h-12 items-center justify-between gap-3">
          {projectHeader ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Link
                to="/projects"
                aria-label={t("nav.projects")}
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  buttonPressClass,
                )}
              >
                <Home className="size-5" />
              </Link>
              <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                {projectHeader.title}
              </p>
            </div>
          ) : (
            <Link to="/projects" className="flex min-w-0 items-center gap-2">
              <SborkaLogoMark />
              <SborkaLogoWordmarkText />
            </Link>
          )}

          <div className="flex shrink-0 items-center gap-1.5">
            <Badge
              className="rounded-full border-0 bg-[var(--alpha-badge-bg)] px-2 py-0.5 text-[10px] font-semibold leading-4 text-[var(--alpha-badge-fg)]"
              title={t("app.alphaWarning")}
              aria-label={t("app.alphaWarning")}
            >
              alpha
            </Badge>
            <ThemeToggle />
            <LanguageSwitcher />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 shrink-0 rounded-full"
                  aria-label={t("header.openProfileMenu")}
                >
                  <User className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="w-56 rounded-md border border-border bg-popover p-1 shadow-md"
              >
                <div className="min-w-0 rounded-sm px-2 py-1.5 text-sm font-semibold text-popover-foreground">
                  <p className="truncate">{user?.username ?? t("header.account")}</p>
                  {user?.email ? (
                    <p className="truncate text-xs font-normal text-muted-foreground">
                      {user.email}
                    </p>
                  ) : null}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="px-2 py-1.5">
                  <Link to="/profile" className="w-full">
                    {t("header.profileSettings")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="px-2 py-1.5 text-destructive focus:text-destructive"
                  onSelect={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                >
                  {t("header.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <nav className="fixed inset-x-3 bottom-[max(env(safe-area-inset-bottom),0.75rem)] z-40 rounded-2xl border border-border bg-[var(--mobile-chrome-bg)] p-1.5 shadow-lg">
        <div className="grid grid-cols-3 gap-1">
          {mobileNavItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-medium pressable",
                  item.isActive
                    ? "bg-background text-foreground shadow-sm dark:bg-muted dark:shadow-none"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground dark:hover:bg-muted/50",
                )}
              >
                {item.icon ? <item.icon className="size-4" /> : null}
                <span className="max-w-full truncate">
                  {item.label ?? t(item.labelKey!)}
                </span>
              </Link>
            ))}
        </div>
      </nav>
    </>
  )
}
