import { Link, useLocation } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import {
  Home,
  RussianRuble,
  FileText,
  Code2,
  ExternalLink,
  PanelLeft,
  User,
  ChevronsUp,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Button, buttonPressClass } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SborkaLogoMark, SborkaLogoWordmarkText } from "@/components/logo"

const navItems = [
  { labelKey: "nav.projects", icon: Home, href: "/projects" },
  { labelKey: "nav.subscription", icon: RussianRuble, href: "/subscription" },
  { labelKey: "nav.profile", icon: User, href: "/profile" },
]

const UPGRADE_LIMITS_FORM_URL =
  "https://forms.yandex.ru/cloud/6984ca2c84227c2270c569db"

const externalItems = [
  {
    labelKey: "nav.documentation",
    icon: FileText,
    hrefKey: "nav.docsHref",
    external: true,
  },
  {
    labelKey: "nav.code",
    icon: Code2,
    href: "https://github.com/sb0rka/sb0rka",
    external: true,
  },
]

const logoTransition = { duration: 0.21, ease: "easeOut" as const }
const upgradeTransition = { duration: 0.2, ease: "easeOut" as const }
const railTransitionClass = "transition-[width] duration-[400ms] ease-out"

/** Keeps label left edge at 56px from sidebar (matches expanded left-10 + nav pl-4). */
const labelSlotClass =
  "left-[calc(56px-var(--sidebar-nav-pl))]"

const labelTransitionClass =
  "transition-[max-width,opacity] duration-[400ms] ease-out"

/** Shared horizontal anchor — 30px from the sidebar edge (row stays full-width). */
const sidebarAnchorClass =
  "absolute [left:calc(30px-var(--sidebar-nav-pl))] -translate-x-1/2"

const sidebarIconSlotClass = cn(
  "pointer-events-none top-1/2 z-10 -translate-y-1/2",
  sidebarAnchorClass,
)

const navIconClass =
  "h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110"

/** Left edge of selector / divider — matches collapsed w-9 pill (12px from sidebar). */
const sidebarRailStartClass =
  "left-[calc(30px-var(--sidebar-nav-pl)-1.125rem)]"

const railWidthClass = (collapsed: boolean) =>
  collapsed
    ? "w-9"
    : "w-[calc(100%-30px+var(--sidebar-nav-pl)+1.125rem)]"

function rowChromeClass(collapsed: boolean) {
  return cn(
    "pointer-events-none absolute inset-y-0 z-0 rounded-lg",
    sidebarRailStartClass,
    railTransitionClass,
    railWidthClass(collapsed),
  )
}

function dividerClass(collapsed: boolean) {
  return cn(
    "absolute left-[calc(30px-var(--sidebar-nav-pl)-1.125rem)] h-px shrink-0",
    railTransitionClass,
    railWidthClass(collapsed),
  )
}

function upgradeChromeClass(collapsed: boolean) {
  return cn(
    "pointer-events-none absolute inset-y-0 z-0 rounded-md border border-input bg-background",
    "transition-[width,left,right] duration-[400ms] ease-out",
    collapsed
      ? cn(sidebarRailStartClass, "right-auto w-9")
      : "inset-x-0 w-full",
  )
}

interface SidebarProps {
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export function Sidebar({ collapsed = false, onToggleCollapsed }: SidebarProps) {
  const { t } = useTranslation()
  const location = useLocation()

  const itemLabelClass = cn(
    "pointer-events-none overflow-hidden whitespace-nowrap",
    labelSlotClass,
    labelTransitionClass,
    collapsed ? "max-w-0 opacity-0" : "max-w-[12rem] opacity-100",
  )

  const externalIconWrapClass = cn(
    "pointer-events-none overflow-hidden",
    labelTransitionClass,
    collapsed ? "max-w-0 opacity-0" : "max-w-6 opacity-100",
  )

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col justify-between overflow-hidden border-r border-border bg-[var(--sidebar-bg)] transition-[width] duration-[400ms] ease-out",
        collapsed ? "w-[60px] [--sidebar-nav-pl:0.5rem]" : "w-[214px] [--sidebar-nav-pl:1rem]",
      )}
    >
      <div className="flex flex-col gap-2">
        <div className="relative flex h-[60px] items-center overflow-hidden border-b border-border px-6">
          <SborkaLogoMark className="absolute left-[30px] top-1/2 z-10 -translate-x-1/2 -translate-y-1/2" />
          <motion.div
            className="absolute top-1/2 flex -translate-y-1/2 items-center overflow-hidden"
            style={{ left: "calc(30px + 12.5px + 6px)" }}
            initial={false}
            animate={{
              width: collapsed ? 0 : 58,
              opacity: collapsed ? 0 : 1,
            }}
            transition={logoTransition}
          >
            <SborkaLogoWordmarkText />
          </motion.div>
        </div>

        <nav className="flex flex-col gap-3 px-[var(--sidebar-nav-pl)]">
          {navItems.map((item) => {
            const label = t(item.labelKey)
            const isActive =
              item.href === "/projects"
                ? location.pathname === "/projects" ||
                  location.pathname.startsWith("/projects/")
                : location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "group relative block h-9 w-full rounded-lg text-sm font-medium pressable",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
                title={collapsed ? label : undefined}
              >
                <span
                  className={cn(
                    rowChromeClass(collapsed),
                    isActive ? "bg-muted" : "group-hover:bg-muted/50",
                  )}
                  aria-hidden
                />
                <item.icon className={cn(navIconClass, sidebarIconSlotClass)} />
                <span
                  className={cn(
                    itemLabelClass,
                    "absolute top-1/2 -translate-y-1/2",
                  )}
                >
                  {label}
                </span>
              </Link>
            )
          })}

          <div className="relative h-px w-full">
            <Separator className={dividerClass(collapsed)} />
          </div>

          {externalItems.map((item) => {
            const href = "hrefKey" in item ? t(item.hrefKey ?? "") : item.href
            const label = t(item.labelKey)
            return (
              <a
                key={item.labelKey}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block h-9 w-full rounded-lg text-sm font-medium text-muted-foreground pressable"
                title={collapsed ? label : undefined}
              >
                <span
                  className={cn(
                    rowChromeClass(collapsed),
                    "group-hover:bg-muted/50",
                  )}
                  aria-hidden
                />
                <item.icon className={cn(navIconClass, sidebarIconSlotClass)} />
                <span
                  className={cn(
                    itemLabelClass,
                    "absolute right-9 top-1/2 -translate-y-1/2",
                  )}
                >
                  {label}
                </span>
                <span
                  className={cn(
                    externalIconWrapClass,
                    "absolute right-3 top-1/2 -translate-y-1/2",
                  )}
                >
                  <ExternalLink className="h-4 w-4" />
                </span>
              </a>
            )
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-3 px-[var(--sidebar-nav-pl)] py-4">
        <Button
          variant="outline"
          className="relative h-9 w-full overflow-hidden border-transparent bg-transparent p-0 shadow-none"
          asChild
        >
          <a
            href={UPGRADE_LIMITS_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="relative block h-9 w-full"
            title={collapsed ? t("nav.upgradeLimits") : undefined}
          >
            <span className={upgradeChromeClass(collapsed)} aria-hidden />
            <AnimatePresence mode="wait" initial={false}>
              {collapsed ? (
                <motion.span
                  key="icon"
                  className={sidebarIconSlotClass}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={upgradeTransition}
                >
                  <ChevronsUp className={navIconClass} />
                </motion.span>
              ) : (
                <motion.span
                  key="text"
                  className={cn(
                    "absolute top-1/2 -translate-y-1/2 whitespace-nowrap",
                    labelSlotClass,
                  )}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={upgradeTransition}
                >
                  {t("nav.upgradeLimits")}
                </motion.span>
              )}
            </AnimatePresence>
          </a>
        </Button>
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
