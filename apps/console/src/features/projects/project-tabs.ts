import { BarChart3, Cpu, Database, KeyRound, LayoutGrid, Settings } from "lucide-react"

export const PROJECT_TABS = [
  "overview",
  "models",
  "databases",
  "data-explorer",
  "secrets",
  "settings",
] as const

export type ProjectTab = (typeof PROJECT_TABS)[number]

export function isProjectTab(value: string | null): value is ProjectTab {
  return value !== null && (PROJECT_TABS as readonly string[]).includes(value)
}

export const projectTabIcon = {
  overview: BarChart3,
  models: Cpu,
  databases: Database,
  "data-explorer": LayoutGrid,
  secrets: KeyRound,
  settings: Settings,
} as const satisfies Record<ProjectTab, typeof BarChart3>
