import { Check, Languages } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  getResolvedLanguage,
  languageStorageKey,
  supportedLanguages,
  type SupportedLanguage,
} from "@/lib/i18n"

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const currentLanguage = getResolvedLanguage()

  function handleLanguageChange(language: SupportedLanguage) {
    window.localStorage.setItem(languageStorageKey, language)
    void i18n.changeLanguage(language)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-full"
          aria-label={t("language.switcherLabel")}
          title={t("language.label")}
        >
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8}>
        {supportedLanguages.map((language) => (
          <DropdownMenuItem
            key={language}
            className="gap-2"
            onSelect={() => handleLanguageChange(language)}
          >
            <span className="min-w-16">{t(`language.${language}`)}</span>
            {currentLanguage === language ? (
              <Check className="h-4 w-4 text-muted-foreground" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
