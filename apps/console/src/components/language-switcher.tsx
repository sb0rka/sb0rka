import { useTranslation } from "react-i18next"
import { LanguageSwitcher as LanguageSwitcherButton } from "@sb0rka/ui"
import {
  getResolvedLanguage,
  languageStorageKey,
  type SupportedLanguage,
} from "@/lib/i18n"

const LANG_INDEX: Record<SupportedLanguage, number> = {
  en: 0,
  ru: 1,
}

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
    <LanguageSwitcherButton 
      language={currentLanguage}
      nextLanguage={nextLanguage}
      languageOrder={LANG_INDEX}
      onToggle={handleToggle}
      ariaLabel={
        nextLanguage === "en" ? t("language.switchToEn") : t("language.switchToRu")
      }
      title={`${t("language.label")}: ${t(`language.${nextLanguage}`)}`}
    />
  )
}
