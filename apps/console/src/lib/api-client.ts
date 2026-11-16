import { getToken, setToken, clearToken, registerRefreshHandler, getAuthGeneration } from "./auth-store"

const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === "true"
const AUTH_BASE_URL = USE_MOCK_API
  ? ""
  : (import.meta.env.VITE_AUTH_BASE_URL ?? "https://auth.sb0rka.ru")
const RESOURCE_BASE_URL = USE_MOCK_API
  ? ""
  : (import.meta.env.VITE_API_BASE_URL ?? "https://api.sb0rka.ru")
const QUERY_RUNNER_BASE_URL =
import.meta.env.VITE_QUERY_RUNNER_BASE_URL ?? "https://psql-executor.proxy.sb0rka.ru"


const COOKIE_PATHS = ["/auth/login", "/auth/refresh", "/auth/logout", "/identity/users/current/password"]

const FORM_PATHS = [
  "/auth/login",
  "/identity/users",
  "/identity/users/current",
  "/identity/users/current/password",
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
  base?: "auth" | "resource" | "queryRunner"
}

let refreshPromise: Promise<void> | null = null
let refreshOperation: string | null = null
let refreshController: AbortController | null = null
window.addEventListener("auth-cleared", () => {
  refreshController?.abort()
  refreshController = null
  refreshOperation = null
  refreshPromise = null
})
function requireCurrentAuth(generation: number): void {
  if (generation !== getAuthGeneration()) throw new ApiError(401, "Session ended")
}

async function refreshToken(): Promise<void> {
  const generation = getAuthGeneration()
  const controller = new AbortController()
  refreshController = controller
  authLog("refreshToken start", { url: `${AUTH_BASE_URL}/auth/refresh` })
  const res = await fetch(`${AUTH_BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "Idempotency-Key": refreshOperation ??= crypto.randomUUID() },
    body: "{}",
    signal: controller.signal,
  })

  requireCurrentAuth(generation)
  if (!res.ok) {
    authLog("refreshToken failed", { status: res.status })
    if (res.status === 401) refreshOperation = null
    throw new ApiError(res.status, await res.text())
  }

  const data = await res.json()
  requireCurrentAuth(generation)
  refreshOperation = null
  setToken(data.access_token)
  authLog("refreshToken success")
}

function deduplicatedRefresh(): Promise<void> {
  if (!refreshPromise) {
    authLog("deduplicatedRefresh: create new promise")
    const pending = refreshToken().finally(() => {
      authLog("deduplicatedRefresh: clear promise")
      if (refreshPromise === pending) refreshPromise = null
    })
    refreshPromise = pending
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
  const generation = getAuthGeneration()
  const res = await performRequest(opts)
  requireCurrentAuth(generation)
  if (res.status === 204) return undefined as T
  const data = await res.json()
  requireCurrentAuth(generation)
  return data as T
}

export async function apiRequestText(opts: RequestOptions): Promise<string> {
  const generation = getAuthGeneration()
  const res = await performRequest(opts)
  const data = await res.text()
  requireCurrentAuth(generation)
  return data
}

async function performRequest(opts: RequestOptions): Promise<Response> {
  const generation = getAuthGeneration()
  const baseUrl =
    opts.base === "resource"
      ? RESOURCE_BASE_URL
      : opts.base === "queryRunner"
        ? QUERY_RUNNER_BASE_URL
          : AUTH_BASE_URL
  const url = `${baseUrl}${opts.path}`
  let res = await fetch(url, buildFetchInit(opts))

  requireCurrentAuth(generation)
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

  requireCurrentAuth(generation)
  if (!res.ok) {
    throw new ApiError(res.status, await res.text())
  }
  return res
}

export { deduplicatedRefresh as refresh }

export function getAuthBaseUrl(): string {
  return AUTH_BASE_URL || window.location.origin
}
