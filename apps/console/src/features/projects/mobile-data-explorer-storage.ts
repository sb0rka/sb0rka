import type { RunDatabaseQueryResponse } from "./api"
import type { AiQueryChatMessage } from "./use-ai-query-chat"

const STORAGE_PREFIX = "sb0rka.console.mobileDataExplorer.v1"
export const MOBILE_DATA_EXPLORER_DEFAULT_SQL = "select 1;"

export type MobileDataExplorerPersistedState = {
  sql: string
  messages: AiQueryChatMessage[]
  result: RunDatabaseQueryResponse | null
  aiDraftInput: string
}

function stateKey(projectId: string, databaseId: string): string {
  return `${STORAGE_PREFIX}.${projectId}.${databaseId}`
}

function selectedDatabaseKey(projectId: string): string {
  return `${STORAGE_PREFIX}.${projectId}.selectedDatabase`
}

export function loadSelectedDatabaseId(projectId: string): string | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(selectedDatabaseKey(projectId))
  const normalized = raw?.trim() ?? ""
  return normalized.length > 0 ? normalized : null
}

export function saveSelectedDatabaseId(projectId: string, databaseId: string): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(selectedDatabaseKey(projectId), databaseId)
}

function defaultState(): MobileDataExplorerPersistedState {
  return { sql: MOBILE_DATA_EXPLORER_DEFAULT_SQL, messages: [], result: null, aiDraftInput: "" }
}

export function loadMobileDataExplorerState(
  projectId: string,
  databaseId: string,
): MobileDataExplorerPersistedState {
  if (typeof window === "undefined") return defaultState()

  try {
    const raw = window.localStorage.getItem(stateKey(projectId, databaseId))
    if (!raw) return defaultState()

    const parsed = JSON.parse(raw) as Partial<MobileDataExplorerPersistedState>
    const result = parsed.result
    return {
      sql: typeof parsed.sql === "string" ? parsed.sql : MOBILE_DATA_EXPLORER_DEFAULT_SQL,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      aiDraftInput: typeof parsed.aiDraftInput === "string" ? parsed.aiDraftInput : "",
      result:
        result &&
        typeof result === "object" &&
        Array.isArray(result.columns) &&
        Array.isArray(result.rows)
          ? (result as RunDatabaseQueryResponse)
          : null,
    }
  } catch {
    return defaultState()
  }
}

export function saveMobileDataExplorerState(
  projectId: string,
  databaseId: string,
  state: MobileDataExplorerPersistedState,
): void {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(stateKey(projectId, databaseId), JSON.stringify(state))
  } catch {
    // localStorage quota or private browsing — persistence is best-effort.
  }
}
