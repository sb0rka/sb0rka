import { useQuery, useQueryClient } from "@tanstack/react-query"
import { initializeAccount } from "@/features/auth/api"
import { useAuth } from "@/features/auth/auth-provider"
import { listDatabases, listProjects, listSecrets } from "@/features/projects/api"
import { ApiError } from "@/lib/api-client"
import { getCurrentPlan, listPlans } from "./api"
import type { PlanListResponse, PlanResponse } from "./api"

const CURRENT_PLAN_KEY = ["subscription", "current-plan"] as const

export function useCurrentPlan() {
  const { isAuthenticated } = useAuth()

  return useQuery<PlanResponse>({
    queryKey: CURRENT_PLAN_KEY,
    queryFn: getCurrentPlan,
    enabled: isAuthenticated,
  })
}

export function useEnsureAccountPlan() {
  const { isAuthenticated, user } = useAuth()
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: ["subscription", "account-initialized", user?.id],
    enabled: isAuthenticated && Boolean(user?.id),
    queryFn: async () => {
      try {
        await getCurrentPlan()
        return true
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 404) throw err
      }

      await initializeAccount()
      await queryClient.invalidateQueries({ queryKey: CURRENT_PLAN_KEY })
      return true
    },
  })
}

export function usePlans() {
  return useQuery<PlanListResponse>({
    queryKey: ["subscription", "plans"],
    queryFn: listPlans,
  })
}

export interface SubscriptionUsage {
  projects: number
  databases: number
  secrets: number
}

export function useSubscriptionUsage() {
  const { isAuthenticated } = useAuth()

  return useQuery<SubscriptionUsage>({
    queryKey: ["subscription", "usage"],
    queryFn: async () => {
      const projectsResponse = await listProjects()
      const projects = projectsResponse.projects

      const perProjectUsage = await Promise.all(
        projects.map(async (project) => {
          const [databasesResponse, secretsResponse] = await Promise.all([
            listDatabases(project.public_id),
            listSecrets(project.public_id),
          ])

          return {
            databases: databasesResponse.dbis.length,
            secrets: secretsResponse.secrets.length,
          }
        }),
      )

      const databases = perProjectUsage.reduce(
        (sum, item) => sum + item.databases,
        0,
      )
      const secrets = perProjectUsage.reduce((sum, item) => sum + item.secrets, 0)

      return {
        projects: projects.length,
        databases,
        secrets,
      }
    },
    enabled: isAuthenticated,
  })
}
