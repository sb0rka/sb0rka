import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/features/auth/auth-provider"
import { listDatabases, listProjects, listSecrets } from "@/features/projects/api"
import { getCurrentPlan, listPlans } from "./api"
import type { PlanListResponse, PlanResponse } from "./api"

export function useCurrentPlan() {
  const { isAuthenticated } = useAuth()

  return useQuery<PlanResponse>({
    queryKey: ["subscription", "current-plan"],
    queryFn: getCurrentPlan,
    enabled: isAuthenticated,
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
            listDatabases(project.id),
            listSecrets(project.id),
          ])

          return {
            databases: databasesResponse.databases.length,
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
