import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

type LayoutContextValue = {
  dataExplorerAiPanelOpen: boolean
  setDataExplorerAiPanelOpen: (open: boolean) => void
}

const LayoutContext = createContext<LayoutContextValue | null>(null)

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [dataExplorerAiPanelOpen, setDataExplorerAiPanelOpen] = useState(false)

  const value = useMemo(
    () => ({ dataExplorerAiPanelOpen, setDataExplorerAiPanelOpen }),
    [dataExplorerAiPanelOpen],
  )

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
}

export function useLayoutContext() {
  const context = useContext(LayoutContext)
  if (!context) {
    throw new Error("useLayoutContext must be used within LayoutProvider")
  }
  return context
}
