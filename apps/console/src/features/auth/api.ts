import { apiRequest, refresh } from "@/lib/api-client"
import { setToken, clearToken } from "@/lib/auth-store"

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
  await refresh()
  return apiRequest<User>({ path: "/user" })
}

export async function logout(): Promise<void> {
  await apiRequest<void>({ method: "POST", path: "/auth/logout" })
  clearToken()
}
