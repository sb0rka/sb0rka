import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import { Navigate, Outlet } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { ApiError } from "@/lib/api-client"
import { clearToken, getToken } from "@/lib/auth-store"
import { bootstrapAuth } from "./api"
import type { User } from "./api"
const AUTH_DEBUG = false

function authLog(message: string, meta?: Record<string, unknown>): void {
  if (!AUTH_DEBUG) return
  if (meta) {
    console.log(`[auth-provider] ${message}`, meta)
    return
  }
  console.log(`[auth-provider] ${message}`)
}

interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  user: User | null
}

const AuthContext = createContext<AuthState>({
  isAuthenticated: false,
  isLoading: true,
  user: null,
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
  })
  const qc = useQueryClient()
  const bootstrapRef = useRef<Promise<void> | null>(null)

  const bootstrap = useCallback(async () => {
    if (bootstrapRef.current) return bootstrapRef.current

    const run = (async () => {
      try {
        authLog("bootstrap run start")
        const user = await bootstrapAuth()
        qc.setQueryData(["user"], user)
        authLog("bootstrap success; setting authenticated state", { userId: user.id })
        setState({ isAuthenticated: true, isLoading: false, user })
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          authLog("bootstrap got 401; forcing logged-out state")
          clearToken()
          setState({ isAuthenticated: false, isLoading: false, user: null })
        } else {
          authLog("bootstrap non-401 error; keeping prior auth state", {
            errorType: err instanceof Error ? err.name : "unknown",
          })
          setState((prev) => (prev.isLoading ? { ...prev, isLoading: false } : prev))
        }
      }
    })()

    bootstrapRef.current = run
    run.finally(() => { bootstrapRef.current = null })
    return run
  }, [qc])

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        bootstrap()
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [bootstrap])

  useEffect(() => {
    return qc.getQueryCache().subscribe((event) => {
      if (event.query.queryKey[0] !== "user") return

      if (event.type === "updated" && event.action.type === "success") {
        const user = event.query.state.data as User | undefined
        if (user) {
          authLog("queryCache user updated; syncing authenticated state", { userId: user.id })
          setState({ isAuthenticated: true, isLoading: false, user })
        }
      }

      if (event.type === "removed") {
        // React Query may GC inactive queries; don't treat that as logout
        // while an access token is still present.
        if (!getToken()) {
          authLog("queryCache user removed and token missing; setting logged-out state")
          setState({ isAuthenticated: false, isLoading: false, user: null })
        } else {
          authLog("queryCache user removed but token exists; ignoring removal")
        }
      }
    })
  }, [qc])

  return (
    <AuthContext.Provider value={state}>
      {children}
    </AuthContext.Provider>
  )
}

export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return null

  if (!isAuthenticated) return <Navigate to="/login" replace />

  return <Outlet />
}
