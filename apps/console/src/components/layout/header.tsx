import { Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { useTranslation } from "react-i18next"
import { ThemeToggle } from "@/components/theme-toggle"
import { useAuth } from "@/features/auth/auth-provider"
import { useLogout } from "@/features/auth/hooks"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { LanguageSwitcher } from "@/components/language-switcher"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface BreadcrumbItem {
  label: string
  href?: string
}

interface HeaderProps {
  breadcrumbs: BreadcrumbItem[]
}

function accountInitial(email: string | undefined, username: string | undefined): string {
  const fromEmail = email?.trim()
  if (fromEmail) {
    const first = fromEmail[0]
    return first ? first.toUpperCase() : "?"
  }
  const fromUser = username?.trim()
  if (fromUser) {
    const first = fromUser[0]
    return first ? first.toUpperCase() : "?"
  }
  return "?"
}

export function Header({ breadcrumbs }: HeaderProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const logoutMutation = useLogout()

  return (
    <header className="flex h-[var(--app-header-height)] shrink-0 items-center justify-between border-b border-border bg-[var(--sidebar-bg)] px-6">
      <nav className="flex items-center gap-2.5">
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1
          const isLink = !!item.href && !isLast
          return (
            <div key={`${item.label}-${index}`} className="flex items-center gap-2.5">
              {index > 0 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              {isLink ? (
                <Link
                  to={item.href as string}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={
                    isLast
                      ? "text-sm text-foreground"
                      : "text-sm text-muted-foreground"
                  }
                >
                  {item.label}
                </span>
              )}
            </div>
          )
        })}
      </nav>

      <div className="flex items-center gap-2">
        {/* <Button variant="ghost" size="sm" className="text-sm font-medium">
          Оставить фидбек
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-full"
          aria-label="Помощь"
        >
          <HelpCircle className="h-4 w-4" />
        </Button> */}

        <Badge
          className="shrink-0 rounded-full border-0 bg-[var(--alpha-badge-bg)] px-2.5 py-0.5 text-xs font-semibold leading-4 text-[var(--alpha-badge-fg)]"
          title={t("app.alphaWarning")}
          aria-label={t("app.alphaWarning")}
        >
          alpha
        </Badge>

        <Separator orientation="vertical" className="h-2 shrink-0" />

        <ThemeToggle />

        <LanguageSwitcher />

        <Separator orientation="vertical" className="h-2 shrink-0" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-auto gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60"
              aria-label={t("header.openProfileMenu")}
            >
              {user ? (
                <>
                  <div className="flex min-w-0 flex-col items-start justify-center gap-0 text-left leading-normal">
                    <span className="truncate text-xs font-medium text-foreground">
                      {user.username}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  </div>
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                    <span className="text-xs font-medium text-muted-foreground">
                      {accountInitial(user.email, user.username)}
                    </span>
                  </div>
                </>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-56 rounded-md border border-border bg-popover p-1 shadow-md"
          >
            <div className="rounded-sm px-2 py-1.5 text-sm font-semibold text-popover-foreground">
              {t("header.account")}
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
    </header>
  )
}
