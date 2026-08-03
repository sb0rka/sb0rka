import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import { flushSync } from "react-dom"

type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  /** Effective palette after applying `theme` and system preference. */
  resolvedAppearance: "light" | "dark"
}

const THEME_TRANSITION_MS = 250

const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: "system",
  setTheme: () => null,
  resolvedAppearance: "light",
})

function resolveAppearance(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
  }
  return theme
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function applyAppearanceToDom(appearance: "light" | "dark") {
  const root = window.document.documentElement
  root.classList.remove("light", "dark")
  root.classList.add(appearance)
}

function transitionAppearance(
  appearance: "light" | "dark",
  animate: boolean,
  onApplied: () => void,
) {
  const commit = () => {
    applyAppearanceToDom(appearance)
    onApplied()
  }

  if (!animate || prefersReducedMotion()) {
    commit()
    return
  }

  const doc = window.document
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(() => {
      flushSync(commit)
    })
    return
  }

  const root = doc.documentElement
  root.classList.add("theme-transition")
  commit()
  window.setTimeout(
    () => root.classList.remove("theme-transition"),
    THEME_TRANSITION_MS,
  )
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "sb0rka-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
  )
  const [resolvedAppearance, setResolvedAppearance] = useState<
    "light" | "dark"
  >(() =>
    resolveAppearance(
      (localStorage.getItem(storageKey) as Theme) || defaultTheme,
    ),
  )

  const applyAppearance = useCallback(
    (appearance: "light" | "dark", animate: boolean) => {
      transitionAppearance(appearance, animate, () => {
        setResolvedAppearance(appearance)
      })
    },
    [],
  )

  useEffect(() => {
    applyAppearance(resolveAppearance(theme), false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync stored theme once on mount
  }, [applyAppearance])

  useEffect(() => {
    if (theme !== "system") return

    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onSystemChange = () => {
      applyAppearance(mq.matches ? "dark" : "light", false)
    }

    mq.addEventListener("change", onSystemChange)
    return () => mq.removeEventListener("change", onSystemChange)
  }, [theme, applyAppearance])

  const setTheme = useCallback(
    (newTheme: Theme) => {
      localStorage.setItem(storageKey, newTheme)
      setThemeState(newTheme)
      applyAppearance(resolveAppearance(newTheme), true)
    },
    [applyAppearance, storageKey],
  )

  const value = {
    theme,
    resolvedAppearance,
    setTheme,
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)
  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")
  return context
}
