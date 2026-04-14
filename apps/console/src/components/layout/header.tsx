import { ChevronRight, HelpCircle, Sun, Moon, User } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"

interface BreadcrumbItem {
  label: string
  href?: string
}

interface HeaderProps {
  breadcrumbs: BreadcrumbItem[]
}

export function Header({ breadcrumbs }: HeaderProps) {
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"

  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-[var(--sidebar-bg)] px-6">
      <nav className="flex items-center gap-2.5">
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1
          return (
            <div key={item.label} className="flex items-center gap-2.5">
              {index > 0 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <span
                className={
                  isLast
                    ? "text-sm text-foreground"
                    : "text-sm text-muted-foreground"
                }
              >
                {item.label}
              </span>
            </div>
          )
        })}
      </nav>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="text-sm font-medium">
          Оставить фидбек
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-full"
          aria-label="Помощь"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-full"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label="Переключить тему"
        >
          {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>

        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <User className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>
    </header>
  )
}
