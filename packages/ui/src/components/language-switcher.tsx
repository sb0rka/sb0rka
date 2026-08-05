import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Button } from "./ui/button"

const labelTransition = {
  duration: 0.32,
  ease: [0.4, 0, 0.2, 1] as const,
}

interface LanguageSwitcherProps<TLang extends string> {
  language: TLang
  nextLanguage: TLang
  languageOrder: Record<TLang, number>
  onToggle: () => void
  ariaLabel: string
  title?: string
}

export function LanguageSwitcher<TLang extends string>({
  language,
  nextLanguage,
  languageOrder,
  onToggle,
  ariaLabel,
  title,
}: LanguageSwitcherProps<TLang>) {
  const reduceMotion = useReducedMotion()

  const slideDirection = languageOrder[language] - languageOrder[nextLanguage]
  const slideDistance = reduceMotion ? 0 : 14
  const enterY = -slideDirection * slideDistance
  const exitY = slideDirection * slideDistance

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full text-xs font-medium tabular-nums"
      onClick={onToggle}
      aria-label={ariaLabel}
      title={title}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={language}
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
          transition={reduceMotion ? { duration: 0.15 } : labelTransition}
        >
          {language.toUpperCase()}
        </motion.span>
      </AnimatePresence>
    </Button>
  )
}
