import { getToken, setToken, clearToken } from "./auth-store"

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "https://auth.sb0rka.ru"

const COOKIE_PATHS = ["/auth/login", "/auth/refresh", "/auth/logout"]

const FORM_PATHS = [
  "/auth/login",
  "/auth/signup",
  "/user",
  "/user/password",
]

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
  auth?: boolean
}

let refreshPromise: Promise<void> | null = null

async function refreshToken(): Promise<void> {
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })

  if (!res.ok) {
    clearToken()
    throw new ApiError(res.status, await res.text())
  }

  const data = await res.json()
  setToken(data.access_token)
}

function deduplicatedRefresh(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = refreshToken().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

function buildFetchInit(opts: RequestOptions): RequestInit {
  const init: RequestInit = { method: opts.method ?? "GET" }
  const headers: Record<string, string> = {}

  if (COOKIE_PATHS.some((p) => opts.path.startsWith(p))) {
    init.credentials = "include"
  }

  if (opts.auth !== false && getToken()) {
    headers["Authorization"] = `Bearer ${getToken()}`
  }

  if (opts.body && FORM_PATHS.some((p) => opts.path.startsWith(p))) {
    headers["Content-Type"] = "application/x-www-form-urlencoded"
    init.body = new URLSearchParams(opts.body).toString()
  }

  init.headers = headers
  return init
}

export async function apiRequest<T = unknown>(
  opts: RequestOptions,
): Promise<T> {
  const url = `${BASE_URL}${opts.path}`
  let res = await fetch(url, buildFetchInit(opts))

  if (res.status === 401 && opts.auth !== false && opts.path !== "/auth/refresh") {
    try {
      await deduplicatedRefresh()
      res = await fetch(url, buildFetchInit(opts))
    } catch {
      clearToken()
      throw new ApiError(401, "Session expired")
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, await res.text())
  }

  if (res.status === 204) return undefined as T

  return res.json()
}

export { deduplicatedRefresh as refresh }
