const STORAGE_KEY = "access_token"

let accessToken: string | null = localStorage.getItem(STORAGE_KEY)

export function getToken(): string | null {
  return accessToken
}

export function setToken(token: string): void {
  accessToken = token
  localStorage.setItem(STORAGE_KEY, token)
}

export function clearToken(): void {
  accessToken = null
  localStorage.removeItem(STORAGE_KEY)
}
