import { apiRequest } from "@/lib/api-client"

export const FREE_ACCOUNT_PLAN_CODE = "free_account"

export interface PlanResponse {
  id: string
  code?: string
  name: string
  description?: string
  db_limit: number
  code_limit: number
  function_limit: number
  secret_limit: number
  project_limit: number
  group_limit: number
  created_at: string
  updated_at: string
}

export interface PlanListResponse {
  plans: PlanResponse[]
}

export async function getCurrentPlan(): Promise<PlanResponse> {
  return apiRequest<PlanResponse>({
    path: "/plan",
    base: "resource",
  })
}

export async function listPlans(): Promise<PlanListResponse> {
  return apiRequest<PlanListResponse>({
    path: "/plans",
    base: "resource",
  })
}
