const STORAGE_KEY = "access_token"
const REFRESH_MARGIN_MS = 30_000

let accessToken: string | null = localStorage.getItem(STORAGE_KEY)
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let onRefresh: (() => Promise<void>) | null = null

export function registerRefreshHandler(handler: () => Promise<void>): void {
  onRefresh = handler
  if (accessToken) scheduleRefresh(accessToken)
}

function decodeJwtExp(token: string): number | null {
  try {
    const payload = token.split(".")[1]
    if (!payload) return null
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")))
    return typeof json.exp === "number" ? json.exp : null
  } catch {
    return null
  }
}

function scheduleRefresh(token: string): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }

  const exp = decodeJwtExp(token)
  if (!exp) return

  const delayMs = exp * 1000 - Date.now() - REFRESH_MARGIN_MS
  if (delayMs <= 0) return

  refreshTimer = setTimeout(async () => {
    refreshTimer = null
    try {
      await onRefresh?.()
    } catch {
      /* 401 interceptor will handle it on the next request */
    }
  }, delayMs)
}

export function getToken(): string | null {
  return accessToken
}

export function setToken(token: string): void {
  accessToken = token
  localStorage.setItem(STORAGE_KEY, token)
  scheduleRefresh(token)
}

export function clearToken(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
  accessToken = null
  localStorage.removeItem(STORAGE_KEY)
}
