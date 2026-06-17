import { Link, useLocation } from "react-router-dom"
import { Home, RussianRuble, User } from "lucide-react"
import { useTranslation } from "react-i18next"
import { SborkaLogoMark, SborkaLogoWordmarkText } from "@/components/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageSwitcher } from "@/components/language-switcher"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/features/auth/auth-provider"
import { useLogout } from "@/features/auth/hooks"
import { cn } from "@/lib/utils"

const mobileNavItems = [
  { labelKey: "nav.projects", icon: Home, href: "/projects" },
  { labelKey: "nav.subscription", icon: RussianRuble, href: "/subscription" },
  { labelKey: "nav.profile", icon: User, href: "/profile" },
]

function accountInitial(email: string | undefined, username: string | undefined): string {
  const value = email?.trim() || username?.trim()
  return value?.[0]?.toUpperCase() ?? "?"
}

export function MobileRootNav() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const location = useLocation()
  const logoutMutation = useLogout()

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-[var(--sidebar-bg)] px-4 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="flex h-12 items-center justify-between gap-3">
          <Link to="/projects" className="flex min-w-0 items-center gap-2">
            <SborkaLogoMark />
            <SborkaLogoWordmarkText />
          </Link>

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
                  variant="ghost"
                  size="icon"
                  className="size-9 rounded-full"
                  aria-label={t("header.openProfileMenu")}
                >
                  <span className="flex size-7 items-center justify-center rounded-full border border-border bg-background text-xs font-medium text-muted-foreground">
                    {accountInitial(user?.email, user?.username)}
                  </span>
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

      <nav className="fixed inset-x-3 bottom-[max(env(safe-area-inset-bottom),0.75rem)] z-40 rounded-2xl border border-border bg-[var(--sidebar-bg)] p-1.5 shadow-lg">
        <div className="grid grid-cols-3 gap-1">
          {mobileNavItems.map((item) => {
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
                  "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-medium pressable",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <item.icon className="size-4" />
                <span className="max-w-full truncate">{t(item.labelKey)}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
