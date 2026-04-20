import { getToken, setToken, clearToken, registerRefreshHandler } from "./auth-store"

const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "https://auth.sb0rka.ru"
const RESOURCE_BASE_URL = import.meta.env.VITE_RESOURCE_API_BASE_URL ?? "https://api.sb0rka.ru"

const COOKIE_PATHS = ["/auth/login", "/auth/refresh", "/auth/logout"]

const FORM_PATHS = [
  "/auth/login",
  "/auth/signup",
  "/user",
  "/user/password",
]
const AUTH_DEBUG = false

function authLog(message: string, meta?: Record<string, unknown>): void {
  if (!AUTH_DEBUG) return
  if (meta) {
    console.log(`[api-client] ${message}`, meta)
    return
  }
  console.log(`[api-client] ${message}`)
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

interface RequestOptions {
  method?: string
  path: string
  body?: Record<string, string>
  json?: unknown
  auth?: boolean
  base?: "auth" | "resource"
}

let refreshPromise: Promise<void> | null = null

async function refreshToken(): Promise<void> {
  authLog("refreshToken start", { url: `${AUTH_BASE_URL}/auth/refresh` })
  const res = await fetch(`${AUTH_BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })

  if (!res.ok) {
    authLog("refreshToken failed", { status: res.status })
    throw new ApiError(res.status, await res.text())
  }

  const data = await res.json()
  setToken(data.access_token)
  authLog("refreshToken success")
}

function deduplicatedRefresh(): Promise<void> {
  if (!refreshPromise) {
    authLog("deduplicatedRefresh: create new promise")
    refreshPromise = refreshToken().finally(() => {
      authLog("deduplicatedRefresh: clear promise")
      refreshPromise = null
    })
  } else {
    authLog("deduplicatedRefresh: reuse in-flight promise")
  }
  return refreshPromise
}

registerRefreshHandler(deduplicatedRefresh)

function buildFetchInit(opts: RequestOptions): RequestInit {
  const init: RequestInit = { method: opts.method ?? "GET" }
  const headers: Record<string, string> = {}

  if (COOKIE_PATHS.some((p) => opts.path.startsWith(p))) {
    init.credentials = "include"
  }

  if (opts.auth !== false && getToken()) {
    headers["Authorization"] = `Bearer ${getToken()}`
  }

  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json"
    init.body = JSON.stringify(opts.json)
  } else if (opts.body && FORM_PATHS.some((p) => opts.path.startsWith(p))) {
    headers["Content-Type"] = "application/x-www-form-urlencoded"
    init.body = new URLSearchParams(opts.body).toString()
  }

  init.headers = headers
  return init
}

export async function apiRequest<T = unknown>(
  opts: RequestOptions,
): Promise<T> {
  const res = await performRequest(opts)

  if (res.status === 204) return undefined as T

  return res.json()
}

export async function apiRequestText(opts: RequestOptions): Promise<string> {
  const res = await performRequest(opts)
  return res.text()
}

async function performRequest(opts: RequestOptions): Promise<Response> {
  const baseUrl = opts.base === "resource" ? RESOURCE_BASE_URL : AUTH_BASE_URL
  const url = `${baseUrl}${opts.path}`
  let res = await fetch(url, buildFetchInit(opts))

  if (res.status === 401 && opts.auth !== false && opts.path !== "/auth/refresh") {
    authLog("protected request returned 401; attempting refresh", { path: opts.path })
    try {
      await deduplicatedRefresh()
      res = await fetch(url, buildFetchInit(opts))
      authLog("request retried after refresh", { path: opts.path, status: res.status })
    } catch (err) {
      // Force logout only when refresh is explicitly unauthorized.
      // Transient network/CORS failures should not wipe local auth state.
      if (err instanceof ApiError && err.status === 401) {
        authLog("refresh unauthorized; clearing token", { path: opts.path })
        clearToken()
        throw new ApiError(401, "Session expired")
      }
      authLog("refresh failed with non-401 error", {
        path: opts.path,
        errorType: err instanceof Error ? err.name : "unknown",
      })
      throw err
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, await res.text())
  }
  return res
}

export { deduplicatedRefresh as refresh }
