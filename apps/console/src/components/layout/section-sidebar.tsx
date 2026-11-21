import { Fragment, type ComponentType } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { PanelLeft } from "lucide-react"
import {
  buttonPressClass,
  cn,
  dividerClass,
  navIconClass,
  rowChromeClass,
  Separator,
  sidebarIconSlotClass,
  SidebarItem,
} from "@sb0rka/ui"
import { SidebarLogo } from "./sidebar-logo"

export interface SectionNavItem {
  labelKey: string
  href: string
  icon: ComponentType<{ className?: string }>
  isActive: boolean
  iconClassName?: string
  dividerBefore?: boolean
}

export interface SidebarCollapseProps {
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export function SectionSidebar({
  items,
  collapsed = false,
  onToggleCollapsed,
}: SidebarCollapseProps & { items: SectionNavItem[] }) {
  const { t } = useTranslation()
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
          {items.map((item) => (
            <Fragment key={item.href}>
              {item.dividerBefore && (
                <div className="relative h-px w-full">
                  <Separator className={dividerClass(collapsed)} />
                </div>
              )}
              <SidebarItem
                asChild
                icon={item.icon}
                iconClassName={item.iconClassName}
                label={t(item.labelKey)}
                active={item.isActive}
                collapsed={collapsed}
              >
                <Link to={item.href} aria-current={item.isActive ? "page" : undefined} />
              </SidebarItem>
            </Fragment>
          ))}
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
          aria-label={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
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
