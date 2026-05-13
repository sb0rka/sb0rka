import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  getResolvedLanguage,
  languageStorageKey,
  type SupportedLanguage,
} from "@/lib/i18n"

function alternateLanguage(current: SupportedLanguage): SupportedLanguage {
  return current === "ru" ? "en" : "ru"
}

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const currentLanguage = getResolvedLanguage()
  const nextLanguage = alternateLanguage(currentLanguage)

  function handleToggle() {
    window.localStorage.setItem(languageStorageKey, nextLanguage)
    void i18n.changeLanguage(nextLanguage)
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-9 w-9 shrink-0 rounded-full text-xs font-medium tabular-nums"
      onClick={handleToggle}
      aria-label={
        nextLanguage === "en" ? t("language.switchToEn") : t("language.switchToRu")
      }
      title={`${t("language.label")}: ${t(`language.${nextLanguage}`)}`}
    >
      {currentLanguage.toUpperCase()}
    </Button>
  )
}
