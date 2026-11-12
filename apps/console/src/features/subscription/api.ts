import { apiRequest } from "@/lib/api-client"

export interface PlanResponse {
  id: string
  name_en: string
  name_ru: string
  description_en?: string
  description_ru?: string
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

export function planTitle(plan: PlanResponse, language: string): string {
  return language.startsWith("ru") ? plan.name_ru : plan.name_en
}

export function planDescription(plan: PlanResponse, language: string): string | undefined {
  const description = language.startsWith("ru") ? plan.description_ru : plan.description_en
  const trimmed = description?.trim()
  return trimmed ? trimmed : undefined
}

export async function getCurrentPlan(): Promise<PlanResponse> {
  return apiRequest<PlanResponse>({
    path: "/account/plan",
    base: "resource",
  })
}

export async function listPlans(): Promise<PlanListResponse> {
  return apiRequest<PlanListResponse>({
    path: "/plans",
    base: "resource",
  })
}
