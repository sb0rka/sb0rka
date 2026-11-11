import { ApiError, apiRequest } from "@/lib/api-client"

/** Cloud extension. An OSS build answers 404 and the balance stays hidden. */
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

export interface PlanQuota {
  id: string
  code: string
  name_en: string
  name_ru: string
  description_en?: string | null
  description_ru?: string | null
  scope: string
  kind: "snapshot" | "periodic" | "balance" | string
  unit: string
  window: string | null
  limit_value: number
}

export interface PlanWithQuotas extends PlanResponse {
  quotas?: PlanQuota[]
}

export interface PlanListResponse {
  plans: PlanWithQuotas[]
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

export interface QuotaPeakSample {
  peak: number
  observed_at: string | null
}

/** Peaks keyed by quota code. */
export type QuotaPeaks = Record<string, QuotaPeakSample>

export interface MoneyAmounts {
  RUB?: string | null
  USD?: string | null
}

export interface QuotaBalance {
  limit: MoneyAmounts
  entitled: MoneyAmounts
  used: MoneyAmounts
  held: MoneyAmounts
  available: MoneyAmounts
}

/** One object per balance quota; the single key is that quota's code. */
export type BalanceItem = Record<string, QuotaBalance>

export interface BalanceResponse {
  balances: BalanceItem[]
}

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

export async function getPlan(planId: string): Promise<PlanWithQuotas> {
  return apiRequest<PlanWithQuotas>({
    path: `/plan/${planId}`,
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

function parseQuotaPeaks(payload: unknown): QuotaPeaks | null {
  if (!payload || typeof payload !== "object") return null
  const peaks = (payload as { peaks?: unknown }).peaks
  if (!peaks || typeof peaks !== "object") return null
  const parsed: QuotaPeaks = {}
  for (const [code, sample] of Object.entries(peaks)) {
    if (!sample || typeof sample !== "object") continue
    const peak = (sample as { peak?: unknown }).peak
    const observed = (sample as { observed_at?: unknown }).observed_at
    if (typeof peak !== "number" || !Number.isFinite(peak)) continue
    parsed[code] = {
      peak,
      observed_at: typeof observed === "string" ? observed : null,
    }
  }
  return parsed
}

// TODO: BACKEND_TODO — no project-level 24h peak. Resource timeseries is per
// database, so it cannot fill the usage table. Expected:
// GET /projects/{project_id}/telemetry/quota-peaks?window=24h
// { peaks: { [quotaCode]: { peak: number, observed_at: string | null } } }
export async function getProjectQuotaPeaks(projectId: string): Promise<QuotaPeaks | null> {
  try {
    const payload = await apiRequest<unknown>({
      path: `/projects/${projectId}/telemetry/quota-peaks?window=24h`,
      base: "resource",
    })
    return parseQuotaPeaks(payload)
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
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
