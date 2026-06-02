export const PROJECT_TABS = [
  "overview",
  "databases",
  "data-explorer",
  "secrets",
  "settings",
] as const

export type ProjectTab = (typeof PROJECT_TABS)[number]

export function isProjectTab(value: string | null): value is ProjectTab {
  return value !== null && (PROJECT_TABS as readonly string[]).includes(value)
}
