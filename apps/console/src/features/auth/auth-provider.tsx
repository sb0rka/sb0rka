import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { Navigate, Outlet } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
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

  const bootstrap = useCallback(async () => {
    try {
      const user = await bootstrapAuth()
      qc.setQueryData(["user"], user)
      setState({ isAuthenticated: true, isLoading: false, user })
    } catch {
      clearToken()
      setState({ isAuthenticated: false, isLoading: false, user: null })
    }
  }, [qc])

  useEffect(() => {
    bootstrap()
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
