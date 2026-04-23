import { Link, useLocation } from "react-router-dom"
import {
  Home,
  RussianRuble,
  FileText,
  Code2,
  ExternalLink,
  PanelLeft,
  User,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SborkaLogo } from "@/components/logo"

const navItems = [
  { label: "Проекты", icon: Home, href: "/projects" },
  { label: "Подписка", icon: RussianRuble, href: "/subscription" },
  { label: "Профиль", icon: User, href: "/profile" },
]

const externalItems = [
  {
    label: "Документация",
    icon: FileText,
    href: "https://docs.sb0rka.com",
    external: true,
  },
  {
    label: "Код",
    icon: Code2,
    href: "https://github.com/sb0rka/sb0rka",
    external: true,
  },
]

interface SidebarProps {
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export function Sidebar({ collapsed = false, onToggleCollapsed }: SidebarProps) {
  const location = useLocation()

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col justify-between border-r border-border bg-[var(--sidebar-bg)] transition-all",
        collapsed ? "w-[60px]" : "w-[214px]",
      )}
    >
      <div className="flex flex-col gap-2">
        <div
          className={cn(
            "flex h-[60px] items-center border-b border-border",
            collapsed ? "justify-center px-2" : "px-6",
          )}
        >
          {collapsed ? (
            <div className="h-4 w-4 rounded-sm bg-foreground" />
          ) : (
            <SborkaLogo />
          )}
        </div>

        <nav className={cn("flex flex-col gap-3", collapsed ? "px-2" : "px-4")}>
          {navItems.map((item) => {
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
                  "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  collapsed ? "justify-center" : "gap-3",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4" />
                {!collapsed && item.label}
              </Link>
            )
          })}

          <Separator />

          {externalItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
                collapsed ? "justify-center" : "gap-3",
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-4 w-4" />
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  <ExternalLink className="h-4 w-4" />
                </>
              )}
            </a>
          ))}
        </nav>
      </div>

      <div
        className={cn(
          "flex flex-col gap-3 py-4",
          collapsed ? "px-2" : "px-4",
        )}
      >
        {!collapsed && (
          <Button variant="outline" className="w-full">
            Повысить лимиты
          </Button>
        )}
        <Separator />
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={cn(
            "flex items-center rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground",
            collapsed ? "justify-center" : "",
          )}
          aria-label={
            collapsed
              ? "Развернуть боковую панель"
              : "Свернуть боковую панель"
          }
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>
    </aside>
  )
}

