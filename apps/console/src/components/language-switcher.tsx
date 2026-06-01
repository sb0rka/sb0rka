import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  getResolvedLanguage,
  languageStorageKey,
  type SupportedLanguage,
} from "@/lib/i18n"

const LANG_INDEX: Record<SupportedLanguage, number> = {
  en: 0,
  ru: 1,
}

const labelTransition = {
  duration: 0.32,
  ease: [0.4, 0, 0.2, 1] as const,
}

function alternateLanguage(current: SupportedLanguage): SupportedLanguage {
  return current === "ru" ? "en" : "ru"
}

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const currentLanguage = getResolvedLanguage()
  const nextLanguage = alternateLanguage(currentLanguage)
  const slideDirection =
    LANG_INDEX[currentLanguage] - LANG_INDEX[nextLanguage]

  function handleToggle() {
    window.localStorage.setItem(languageStorageKey, nextLanguage)
    void i18n.changeLanguage(nextLanguage)
  }

  const slideDistance = reduceMotion ? 0 : 14
  const enterY = -slideDirection * slideDistance
  const exitY = slideDirection * slideDistance

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full text-xs font-medium tabular-nums"
      onClick={handleToggle}
      aria-label={
        nextLanguage === "en" ? t("language.switchToEn") : t("language.switchToRu")
      }
      title={`${t("language.label")}: ${t(`language.${nextLanguage}`)}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={currentLanguage}
          className="absolute inset-0 flex items-center justify-center"
          initial={
            reduceMotion
              ? { opacity: 0 }
              : {
                  y: enterY,
                  opacity: 0,
                  scale: 0.82,
                  filter: "blur(3px)",
                }
          }
          animate={{ y: 0, opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={
            reduceMotion
              ? { opacity: 0 }
              : {
                  y: exitY,
                  opacity: 0,
                  scale: 0.82,
                  filter: "blur(3px)",
                }
          }
          transition={
            reduceMotion ? { duration: 0.15 } : labelTransition
          }
        >
          {currentLanguage.toUpperCase()}
        </motion.span>
      </AnimatePresence>
    </Button>
  )
}
