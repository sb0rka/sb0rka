import { createContext, useContext, useMemo, type ReactNode } from "react"

export interface A11yLabels {
  close: string
  dismissToast: string
  toggleTheme: string
}

const defaultA11yLabels: A11yLabels = {
  close: "Close",
  dismissToast: "Dismiss notification",
  toggleTheme: "Toggle theme",
}

const A11yLabelsContext = createContext<A11yLabels>(defaultA11yLabels)

interface A11yLabelsProviderProps {
  children: ReactNode
  labels?: Partial<A11yLabels>
}

export function A11yLabelsProvider({
  children,
  labels,
}: A11yLabelsProviderProps) {
  const close = labels?.close ?? defaultA11yLabels.close
  const dismissToast = labels?.dismissToast ?? defaultA11yLabels.dismissToast
  const toggleTheme = labels?.toggleTheme ?? defaultA11yLabels.toggleTheme

  const value = useMemo(() => ({ close, dismissToast, toggleTheme }), [close, dismissToast, toggleTheme])

  return (
    <A11yLabelsContext.Provider value={value}>
      {children}
    </A11yLabelsContext.Provider>
  )
}

export function useA11yLabels(): A11yLabels {
  return useContext(A11yLabelsContext)
}
