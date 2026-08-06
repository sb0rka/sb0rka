import { apiRequest, ApiError, getAuthBaseUrl, refresh } from "@/lib/api-client"
import { getToken, setToken, clearToken } from "@/lib/auth-store"
const AUTH_DEBUG = false

function authLog(message: string, meta?: Record<string, unknown>): void {
  if (!AUTH_DEBUG) return
  if (meta) {
    console.log(`[auth-api] ${message}`, meta)
    return
  }
  console.log(`[auth-api] ${message}`)
}

export interface User {
  id: string
  username: string
  email: string
  phone?: number
  created_at: string
  updated_at: string
}

export interface LoginCredentials {
  login: string
  password: string
}

export interface SignupData {
  username: string
  email: string
  password: string
  invite_token: string
}

const OIDC_CONTINUE_PATH = "/oauth2/login/continue"

/**
 * Extracts the opaque auth_request_id from the auth service's `return_to`
 * parameter. Returns null unless `return_to` points exactly at the auth
 * service's OIDC continuation endpoint with a single auth_request_id param,
 * so the id is never derived from (or sent to) any other origin.
 */
export function getOidcAuthRequestId(returnTo: string | null): string | null {
  if (!returnTo || returnTo.length > 4096) return null

  try {
    const target = new URL(returnTo)
    const authBase = new URL(getAuthBaseUrl())
    const keys = [...target.searchParams.keys()]
    const requestIds = target.searchParams.getAll("auth_request_id")

    if (
      target.origin !== authBase.origin ||
      target.pathname !== OIDC_CONTINUE_PATH ||
      target.hash !== "" ||
      target.username !== "" ||
      target.password !== "" ||
      keys.length !== 1 ||
      keys[0] !== "auth_request_id" ||
      requestIds.length !== 1 ||
      requestIds[0] === ""
    ) {
      return null
    }

    return requestIds[0]
  } catch {
    return null
  }
}

export async function continueOidcLogin(authRequestId: string): Promise<string> {
  const response = await apiRequest<{ redirect_to: string }>({
    method: "POST",
    path: OIDC_CONTINUE_PATH,
    json: { auth_request_id: authRequestId },
  })

  const target = new URL(response.redirect_to)
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new Error("Invalid OIDC continuation redirect")
  }
  return target.toString()
}

export async function initializeAccount(): Promise<void> {
  try {
    await apiRequest({
      method: "POST",
      path: "/account/initialize",
      base: "resource"
    })
    authLog("account initialization success")
  } catch (err) {
    console.warn("Account initialization skipped or already initialized:", err)
  }
}

export async function login(credentials: LoginCredentials): Promise<User> {
  const isEmail = credentials.login.includes("@")
  const json: Record<string, string> = {
    password: credentials.password,
    ...(isEmail
      ? { email: credentials.login }
      : { username: credentials.login }),
  }

  const data = await apiRequest<{ access_token: string }>({
    method: "POST",
    path: "/auth/login",
    json,
    auth: false,
  })
  authLog("login success; received access token")
  setToken(data.access_token)

  await initializeAccount()

  return apiRequest<User>({ path: "/identity/users/current" })
}

export async function signup(data: SignupData): Promise<User> {
  return apiRequest<User>({
    method: "POST",
    path: "/identity/users",
    json: {
      username: data.username,
      email: data.email,
      password: data.password,
      invite_token: data.invite_token,
    },
    auth: false,
  })
}

export async function bootstrapAuth(): Promise<User> {
  authLog("bootstrapAuth start", { hasToken: Boolean(getToken()) })
  if (getToken()) {
    try {
      const user = await apiRequest<User>({ path: "/identity/users/current" })
      authLog("bootstrapAuth: token still valid")
      return user
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        authLog("bootstrapAuth: /identity/users/current 401 with token; clearing token")
        clearToken()
      } else {
        authLog("bootstrapAuth: /identity/users/current failed with non-401 error", {
          errorType: err instanceof Error ? err.name : "unknown",
        })
        throw err
      }
    }
  }
  authLog("bootstrapAuth: trying refresh")
  await refresh()
  authLog("bootstrapAuth: refresh success, requesting /identity/users/current")
  return apiRequest<User>({ path: "/identity/users/current" })
}

export async function logout(): Promise<void> {
  await apiRequest<void>({ method: "POST", path: "/auth/logout" })
  clearToken()
}
