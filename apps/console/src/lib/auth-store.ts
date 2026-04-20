const STORAGE_KEY = "access_token"
const REFRESH_MARGIN_MS = 30_000

let accessToken: string | null = localStorage.getItem(STORAGE_KEY)
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let onRefresh: (() => Promise<void>) | null = null
const AUTH_DEBUG = false

function authLog(message: string, meta?: Record<string, unknown>): void {
  if (!AUTH_DEBUG) return
  if (meta) {
    console.log(`[auth-store] ${message}`, meta)
    return
  }
  console.log(`[auth-store] ${message}`)
}

export function registerRefreshHandler(handler: () => Promise<void>): void {
  onRefresh = handler
  authLog("registerRefreshHandler", { hasToken: Boolean(accessToken) })
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
  if (!exp) {
    authLog("scheduleRefresh skipped: no exp claim")
    return
  }

  const delayMs = exp * 1000 - Date.now() - REFRESH_MARGIN_MS
  if (delayMs <= 0) {
    authLog("scheduleRefresh skipped: token too close to expiry", { delayMs })
    return
  }

  authLog("scheduleRefresh armed", { delayMs, refreshMarginMs: REFRESH_MARGIN_MS })

  refreshTimer = setTimeout(async () => {
    refreshTimer = null
    authLog("refresh timer fired")
    try {
      await onRefresh?.()
      authLog("refresh timer completed")
    } catch {
      authLog("refresh timer failed")
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
  authLog("setToken", { hasToken: true })
  scheduleRefresh(token)
}

export function clearToken(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
  accessToken = null
  localStorage.removeItem(STORAGE_KEY)
  authLog("clearToken", { hasToken: false })
}
