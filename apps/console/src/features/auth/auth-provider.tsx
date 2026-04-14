import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import { Navigate, Outlet } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { ApiError } from "@/lib/api-client"
import { clearToken } from "@/lib/auth-store"
import { bootstrapAuth } from "./api"
import type { User } from "./api"

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
        const user = await bootstrapAuth()
        qc.setQueryData(["user"], user)
        setState({ isAuthenticated: true, isLoading: false, user })
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearToken()
          setState({ isAuthenticated: false, isLoading: false, user: null })
        } else {
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
          setState({ isAuthenticated: true, isLoading: false, user })
        }
      }

      if (event.type === "removed") {
        setState({ isAuthenticated: false, isLoading: false, user: null })
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
