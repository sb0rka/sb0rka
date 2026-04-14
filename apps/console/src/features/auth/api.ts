import { apiRequest, ApiError, refresh } from "@/lib/api-client"
import { getToken, setToken, clearToken } from "@/lib/auth-store"
const AUTH_DEBUG = true

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
  invite_code: string
}

export async function login(credentials: LoginCredentials): Promise<User> {
  const isEmail = credentials.login.includes("@")
  const body: Record<string, string> = {
    password: credentials.password,
    ...(isEmail
      ? { email: credentials.login }
      : { username: credentials.login }),
  }

  const data = await apiRequest<{ access_token: string }>({
    method: "POST",
    path: "/auth/login",
    body,
    auth: false,
  })
  authLog("login success; received access token")
  setToken(data.access_token)

  return apiRequest<User>({ path: "/user" })
}

export async function signup(data: SignupData): Promise<User> {
  return apiRequest<User>({
    method: "POST",
    path: "/auth/signup",
    body: {
      username: data.username,
      email: data.email,
      password: data.password,
      invite_code: data.invite_code,
    },
    auth: false,
  })
}

export async function bootstrapAuth(): Promise<User> {
  authLog("bootstrapAuth start", { hasToken: Boolean(getToken()) })
  if (getToken()) {
    try {
      const user = await apiRequest<User>({ path: "/user" })
      authLog("bootstrapAuth: token still valid")
      return user
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        authLog("bootstrapAuth: /user 401 with token; clearing token")
        clearToken()
      } else {
        authLog("bootstrapAuth: /user failed with non-401 error", {
          errorType: err instanceof Error ? err.name : "unknown",
        })
        throw err
      }
    }
  }
  authLog("bootstrapAuth: trying refresh")
  await refresh()
  authLog("bootstrapAuth: refresh success, requesting /user")
  return apiRequest<User>({ path: "/user" })
}

export async function logout(): Promise<void> {
  await apiRequest<void>({ method: "POST", path: "/auth/logout" })
  clearToken()
}
