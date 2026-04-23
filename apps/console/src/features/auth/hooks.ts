import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { clearToken } from "@/lib/auth-store"
import { login, signup, logout } from "./api"
import type { LoginCredentials, SignupData } from "./api"

export function useLogin() {
  const qc = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (credentials: LoginCredentials) => login(credentials),
    onSuccess: (user) => {
      qc.setQueryData(["user"], user)
      navigate("/projects", { replace: true })
    },
  })
}

export function useSignup() {
  const qc = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (data: SignupData & { password: string }) => signup(data),
    onSuccess: async (_user, variables) => {
      try {
        const isEmail = variables.email.includes("@")
        const user = await login({
          login: isEmail ? variables.email : variables.username,
          password: variables.password,
        })
        qc.setQueryData(["user"], user)
        navigate("/projects", { replace: true })
      } catch {
        navigate("/login", { replace: true })
      }
    },
  })
}

export function useLogout() {
  const qc = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      clearToken()
      qc.clear()
      navigate("/login", { replace: true })
    },
  })
}
