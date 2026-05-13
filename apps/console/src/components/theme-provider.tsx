import { createContext, useContext, useEffect, useState } from "react"

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

const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: "system",
  setTheme: () => null,
  resolvedAppearance: "light",
})

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "sb0rka-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )
  const [resolvedAppearance, setResolvedAppearance] = useState<"light" | "dark">("light")

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")

    const apply = (appearance: "light" | "dark") => {
      root.classList.add(appearance)
      setResolvedAppearance(appearance)
    }

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)")
      const applySystem = () => apply(mq.matches ? "dark" : "light")
      applySystem()
      mq.addEventListener("change", applySystem)
      return () => mq.removeEventListener("change", applySystem)
    }

    apply(theme)
  }, [theme])

  const value = {
    theme,
    resolvedAppearance,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme)
      setTheme(theme)
    },
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
