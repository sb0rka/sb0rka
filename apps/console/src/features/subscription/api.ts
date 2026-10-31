import { ApiError, apiRequest } from "@/lib/api-client"

/** Cloud extension. An OSS build answers 404 and the balance section stays hidden. */
export const ACCOUNT_BALANCE_PATH = "/account/balance"

export interface PlanResponse {
  id: string
  name_en: string
  name_ru: string
  description_en?: string | null
  description_ru?: string | null
  code: string
  kind: string
  is_public: boolean
  is_available: boolean
  created_at: string
  updated_at: string
}

export interface PlanListResponse {
  plans: PlanResponse[]
}

export interface QuotaDefinitionSnippet {
  id: string
  name_en: string
  name_ru: string
  description_en?: string | null
  description_ru?: string | null
  code: string
  unit: string
  scope: string
  kind: "snapshot" | "periodic" | "balance" | string
  window: string | null
}

export interface ProjectQuotaItem {
  plan_id: string
  quota_definition: QuotaDefinitionSnippet
  limit_value: number
  entitled: number
  created_at: string
}

export interface ProjectQuotaListResponse {
  public_id: string
  id: string
  quotas: ProjectQuotaItem[]
}

export interface ResourceUsage {
  id: string
  public_id: string
  used: number | null
  status: "available" | "unavailable" | "unsupported"
  observed_at: string | null
}

export interface QuotaUsage {
  used: number | null
  status: "available" | "unavailable" | "unsupported"
  unit: string
  observed_at: string | null
  aggregation?: "max" | ""
  resources?: ResourceUsage[]
}

export interface ProjectUsageResponse {
  id: string
  public_id: string
  usage: Record<string, QuotaUsage>
}

export interface QuotaBalance {
  limit: number
  entitled: number
  used: number
  held: number
  available: number
}

export type BalanceResponse = Record<string, QuotaBalance>

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

export async function getAccountPlan(): Promise<PlanResponse> {
  return apiRequest<PlanResponse>({
    path: "/account/plan",
    base: "resource",
  })
}

export async function listPublicPlans(): Promise<PlanListResponse> {
  return apiRequest<PlanListResponse>({
    path: "/plans",
    base: "resource",
  })
}

export async function getProjectPlan(projectId: string): Promise<PlanResponse> {
  return apiRequest<PlanResponse>({
    path: `/projects/${projectId}/plan`,
    base: "resource",
  })
}

export async function getProjectQuotas(projectId: string): Promise<ProjectQuotaListResponse> {
  return apiRequest<ProjectQuotaListResponse>({
    path: `/projects/${projectId}/quotas`,
    base: "resource",
  })
}

export async function getProjectUsage(projectId: string): Promise<ProjectUsageResponse | null> {
  try {
    return await apiRequest<ProjectUsageResponse>({
      path: `/projects/${projectId}/usage`,
      base: "resource",
    })
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

export async function getAccountBalance(): Promise<BalanceResponse> {
  return apiRequest<BalanceResponse>({
    path: ACCOUNT_BALANCE_PATH,
    base: "resource",
  })
}

export async function initializeAccount(): Promise<void> {
  await apiRequest<void>({
    method: "POST",
    path: "/account/initialize",
    base: "resource",
  })
}
