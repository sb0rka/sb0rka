import { createContext, useContext, useMemo, type ReactNode } from "react"

export interface A11yLabels {
  close: string
  dismissToast: string
}

const defaultA11yLabels: A11yLabels = {
  close: "Close",
  dismissToast: "Dismiss Toast",
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

  const value = useMemo(() => ({ close, dismissToast }), [close, dismissToast])

  return (
    <A11yLabelsContext.Provider value={value}>
      {children}
    </A11yLabelsContext.Provider>
  )
}

export function useA11yLabels(): A11yLabels {
  return useContext(A11yLabelsContext)
}
