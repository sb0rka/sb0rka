import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth/auth-provider"
import type { ProjectResponse } from "@/features/projects/api"
import {
  getAccountBalance,
  getAccountPlan,
  getProjectPlan,
  getProjectQuotas,
  getProjectUsage,
  initializeAccount,
  isNotFound,
  listPublicPlans,
  type BalanceResponse,
  type PlanListResponse,
  type PlanResponse,
  type ProjectQuotaListResponse,
  type ProjectUsageResponse,
} from "./api"
import { joinQuotaRows, type QuotaRowView } from "./quota-format"

export function useAccountPlan() {
  const { isAuthenticated } = useAuth()

  return useQuery<PlanResponse>({
    queryKey: ["subscription", "account-plan"],
    queryFn: getAccountPlan,
    enabled: isAuthenticated,
  })
}

export function useProjectPlan(projectId: string | null) {
  const { isAuthenticated } = useAuth()

  return useQuery<PlanResponse>({
    queryKey: ["subscription", "project", projectId, "plan"],
    queryFn: () => getProjectPlan(projectId ?? ""),
    enabled: isAuthenticated && projectId != null && projectId !== "",
  })
}

export function usePublicPlans(enabled: boolean) {
  const { isAuthenticated } = useAuth()

  return useQuery<PlanListResponse>({
    queryKey: ["subscription", "plans"],
    queryFn: listPublicPlans,
    enabled: isAuthenticated && enabled,
  })
}

export function useAccountBalance() {
  const { isAuthenticated } = useAuth()

  return useQuery<BalanceResponse | null>({
    queryKey: ["subscription", "balance"],
    queryFn: async () => {
      try {
        return await getAccountBalance()
      } catch (error) {
        if (isNotFound(error)) return null
        throw error
      }
    },
    enabled: isAuthenticated,
    retry: false,
  })
}

export function useInitializeAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: initializeAccount,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["subscription", "account-plan"] })
    },
  })
}

export interface ProjectQuotaView {
  project: ProjectResponse
  plan: PlanResponse | undefined
  planError: boolean
  rows: QuotaRowView[]
  quotasError: boolean
  usageAbsent: boolean
  usageError: boolean
  loading: boolean
  nearLimit: boolean
  refetchPlan: () => void
  refetchQuotas: () => void
  refetchUsage: () => void
}

export function useProjectsQuotaOverview(projects: ProjectResponse[]): ProjectQuotaView[] {
  const { isAuthenticated } = useAuth()

  const planQueries = useQueries({
    queries: projects.map((project) => ({
      queryKey: ["subscription", "project", project.public_id, "plan"],
      queryFn: () => getProjectPlan(project.public_id),
      enabled: isAuthenticated,
    })),
  })

  const quotaQueries = useQueries({
    queries: projects.map((project) => ({
      queryKey: ["subscription", "project", project.public_id, "quotas"],
      queryFn: () => getProjectQuotas(project.public_id),
      enabled: isAuthenticated,
    })),
  })

  const usageQueries = useQueries({
    queries: projects.map((project) => ({
      queryKey: ["subscription", "project", project.public_id, "usage"],
      queryFn: () => getProjectUsage(project.public_id),
      enabled: isAuthenticated,
    })),
  })

  return projects.map((project, index) => {
    const planQuery = planQueries[index]
    const quotaQuery = quotaQueries[index]
    const usageQuery = usageQueries[index]
    const usage = (usageQuery?.data ?? null) as ProjectUsageResponse | null
    const quotas = (quotaQuery?.data as ProjectQuotaListResponse | undefined)?.quotas ?? []
    const rows = quotaQuery?.data ? joinQuotaRows(quotas, usage) : []

    return {
      project,
      plan: planQuery?.data as PlanResponse | undefined,
      planError: planQuery?.isError ?? false,
      rows,
      quotasError: quotaQuery?.isError ?? false,
      usageAbsent: usageQuery?.isSuccess === true && usageQuery.data == null,
      usageError: usageQuery?.isError ?? false,
      loading: Boolean(planQuery?.isPending || quotaQuery?.isPending || usageQuery?.isPending),
      nearLimit: rows.some((row) => row.nearLimit),
      refetchPlan: () => {
        void planQuery?.refetch()
      },
      refetchQuotas: () => {
        void quotaQuery?.refetch()
      },
      refetchUsage: () => {
        void usageQuery?.refetch()
      },
    }
  })
}
