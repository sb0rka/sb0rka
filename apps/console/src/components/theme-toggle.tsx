import { Sun, Moon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { t } = useTranslation()
  const { setTheme, resolvedAppearance } = useTheme()
  const isDark = resolvedAppearance === "dark"

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-9 w-9 shrink-0 rounded-full"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={t("header.toggleTheme")}
    >
      {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </Button>
  )
}
