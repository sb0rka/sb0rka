import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Sun, Moon } from "lucide-react"
import { Button } from "./ui/button"
import { useTheme } from "./theme-provider"
import { useA11yLabels } from "./a11y-labels"

const iconTransition = {
  duration: 0.45,
  ease: [0.4, 0, 0.2, 1] as const,
}

export function ThemeToggle() {
  const { toggleTheme } = useA11yLabels()
  const { setTheme, resolvedAppearance } = useTheme()
  const isDark = resolvedAppearance === "dark"
  const reduceMotion = useReducedMotion()

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={toggleTheme}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isDark ? "moon" : "sun"}
          className="absolute inset-0 flex items-center justify-center"
          initial={
            reduceMotion
              ? { opacity: 0 }
              : { rotate: 180, scale: 0.4, opacity: 0 }
          }
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={
            reduceMotion
              ? { opacity: 0 }
              : { rotate: -180, scale: 0.4, opacity: 0 }
          }
          transition={reduceMotion ? { duration: 0.15 } : iconTransition}
        >
          {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </motion.span>
      </AnimatePresence>
    </Button>
  )
}
