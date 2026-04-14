import { Link, useLocation } from "react-router-dom"
import {
  Home,
  DollarSign,
  FileText,
  Code2,
  ExternalLink,
  PanelLeft,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SborkaLogo } from "@/components/logo"

const navItems = [
  { label: "Проекты", icon: Home, href: "/projects" },
  { label: "Подписка", icon: DollarSign, href: "/subscription" },
]

const externalItems = [
  { label: "Документация", icon: FileText, href: "#", external: true },
  { label: "Код", icon: Code2, href: "#", external: true },
]

export function Sidebar() {
  const location = useLocation()

  return (
    <aside className="flex h-full w-[214px] shrink-0 flex-col justify-between border-r border-border bg-[var(--sidebar-bg)]">
      <div className="flex flex-col gap-2">
        <div className="flex h-[60px] items-center border-b border-border px-6">
          <SborkaLogo />
        </div>

        <nav className="flex flex-col gap-3 px-4">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
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
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          ))}
        </nav>
      </div>

      <div className="flex flex-col gap-3 px-4 py-4">
        <Button variant="outline" className="w-full">
          Повысить лимиты
        </Button>
        <Separator />
        <button className="flex items-center rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground">
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>
    </aside>
  )
}

