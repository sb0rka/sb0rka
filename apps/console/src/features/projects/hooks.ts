import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth/auth-provider"
import {
  listProjects,
  listDatabases,
  createDatabase,
  createProject,
  updateProject,
  deactivateProject,
  getProject,
  listTables,
  listSecrets,
  listResourceTags,
  attachResourceTag,
  getDatabase,
  updateDatabase,
  getDatabaseUri,
  runDatabaseQuery,
  deactivateResource,
  createSecret,
  updateSecretValue,
  revealSecretValue,
  listResources,
  getResourceMetricTimeseries,
  fetchQueryRunnerSchema,
} from "./api"
import { mayAffectExplorerSchema } from "./may-affect-explorer-schema"
import { databaseSyncStatusNeedsPolling } from "./components/get-database-status-label"
import type {
  ProjectResponse,
  ProjectListResponse,
  DatabaseListResponse,
  CreateDatabaseRequest,
  CreateProjectRequest,
  UpdateProjectRequest,
  SecretListResponse,
  CreateSecretRequest,
  UpdateSecretValueRequest,
  AttachResourceTagRequest,
  ProjectTagListResponse,
  DatabaseResponse,
  UpdateDatabaseRequest,
  RevealSecretValueResponse,
  ProjectResourceListResponse,
  ObservabilityMetricPoint,
  ResourceMetricTimeseries,
  RunDatabaseQueryRequest,
  RunDatabaseQueryResponse,
} from "./api"

const PROJECTS_KEY = ["projects"] as const
const DATABASE_HEALTH_CHECK_INTERVAL_MS = 30_000
const PROJECT_TIMESERIES_METRICS = [
  "active_connections",
  "db_size_rate",
  "db_size",
  "net_receive",
  "net_transmit",
] as const

export type ProjectTimeseriesMetric = (typeof PROJECT_TIMESERIES_METRICS)[number]
export type ProjectMetricsTimeseries = Record<ProjectTimeseriesMetric, ResourceMetricTimeseries>

export interface ProjectMetricTimeseriesResult {
  unit: string
  points: ObservabilityMetricPoint[]
  byResource: { resourceId: string; points: ObservabilityMetricPoint[] }[]
}

const DATABASE_SYNC_STATUS_POLL_MS = 5_000

export function useProjects() {
  const { isAuthenticated } = useAuth()

  return useQuery<ProjectListResponse>({
    queryKey: PROJECTS_KEY,
    queryFn: listProjects,
    enabled: isAuthenticated,
  })
}

export function useDatabases(projectId: string) {
  const { isAuthenticated } = useAuth()

  return useQuery<DatabaseListResponse>({
    queryKey: ["projects", projectId, "databases"],
    queryFn: () => listDatabases(projectId),
    enabled: isAuthenticated && !!projectId,
    refetchInterval: (query) => {
      const rows = query.state.data?.databases
      if (!rows?.length) return false
      return rows.some(databaseSyncStatusNeedsPolling)
        ? DATABASE_SYNC_STATUS_POLL_MS
        : false
    },
  })
}

export function useCreateDatabase(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateDatabaseRequest) => createDatabase(projectId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "databases"] })
    },
  })
}

export function useDatabase(projectId: string, resourceId?: string) {
  const { isAuthenticated } = useAuth()

  return useQuery<DatabaseResponse>({
    queryKey: ["projects", projectId, "resources", resourceId, "database"],
    queryFn: () => getDatabase(projectId, resourceId as string),
    enabled: isAuthenticated && !!projectId && resourceId !== undefined,
    refetchInterval: (query) => {
      const row = query.state.data
      if (!row) return false
      return databaseSyncStatusNeedsPolling(row)
        ? DATABASE_SYNC_STATUS_POLL_MS
        : false
    },
  })
}

export function useUpdateDatabase(projectId: string, resourceId?: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateDatabaseRequest) =>
      updateDatabase(projectId, resourceId as string, data),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["projects", projectId, "resources", resourceId, "database"],
      })
      qc.invalidateQueries({ queryKey: ["projects", projectId, "databases"] })
    },
  })
}

export function useDatabaseUri(
  projectId: string,
  resourceId?: string,
  enabled = false,
) {
  const { isAuthenticated } = useAuth()

  return useQuery<string>({
    queryKey: ["projects", projectId, "resources", resourceId, "database", "uri"],
    queryFn: () => getDatabaseUri(projectId, resourceId as string),
    enabled: isAuthenticated && !!projectId && resourceId !== undefined && enabled,
  })
}

export function useRunDatabaseQuery() {
  const qc = useQueryClient()

  return useMutation<RunDatabaseQueryResponse, Error, RunDatabaseQueryRequest>({
    mutationFn: runDatabaseQuery,
    onError: (_error, variables) => {
      qc.invalidateQueries({
        queryKey: ["projects", variables.project_id, "dataExplorer", "databaseHealth"],
      })
    },
    onSuccess: (_data, variables) => {
      const healthQueryKey = ["projects", variables.project_id, "dataExplorer", "databaseHealth"]
      qc.setQueryData<DataExplorerDatabaseHealth[]>(
        healthQueryKey,
        (current) => {
          if (!current) return current
          return current.map((item) =>
            item.database.resource_id === variables.database_id
              ? { ...item, status: "healthy", errorMessage: undefined }
              : item,
          )
        },
      )
      const hasNotConnectedDatabases = qc
        .getQueryData<DataExplorerDatabaseHealth[]>(healthQueryKey)
        ?.some((item) => item.status !== "healthy")
      if (hasNotConnectedDatabases) {
        qc.invalidateQueries({ queryKey: healthQueryKey })
      }
      if (!mayAffectExplorerSchema(variables.query)) return
      qc.invalidateQueries({
        queryKey: ["projects", variables.project_id, "dataExplorer", "schema"],
      })
    },
  })
}

export interface DataExplorerColumnNode {
  name: string
  data_type: string
  is_nullable: boolean
  is_pk: boolean
}

export interface DataExplorerTableNode {
  schema: string
  name: string
  columns: DataExplorerColumnNode[]
}

export interface DataExplorerDatabaseNode {
  database: DatabaseResponse
  tables: DataExplorerTableNode[]
}

export interface DataExplorerDatabaseHealth {
  database: DatabaseResponse
  status: "healthy" | "unhealthy" | "checking"
  errorMessage?: string
}

export function useDataExplorerSchema(projectId: string) {
  const { isAuthenticated } = useAuth()

  return useQuery<DataExplorerDatabaseNode[]>({
    queryKey: ["projects", projectId, "dataExplorer", "schema"],
    queryFn: async () => {
      const { databases } = await listDatabases(projectId)
      const out: DataExplorerDatabaseNode[] = []

      for (const database of databases) {
        const payload = await fetchQueryRunnerSchema({
          project_id: projectId,
          database_id: database.resource_id,
        })
        const tables: DataExplorerTableNode[] = payload.tables.map((t) => ({
          schema: t.schema,
          name: t.name,
          columns: t.columns.map((c) => ({
            name: c.name,
            data_type: c.data_type,
            is_nullable: c.is_nullable,
            is_pk: c.is_pk,
          })),
        }))
        out.push({ database, tables })
      }

      return out
    },
    enabled: isAuthenticated && !!projectId,
  })
}

export function useDataExplorerDatabaseHealth(projectId: string) {
  const { isAuthenticated } = useAuth()

  return useQuery<DataExplorerDatabaseHealth[]>({
    queryKey: ["projects", projectId, "dataExplorer", "databaseHealth"],
    queryFn: async () => {
      const { databases } = await listDatabases(projectId)

      const checks = await Promise.all(
        databases.map(async (database): Promise<DataExplorerDatabaseHealth> => {
          try {
            await runDatabaseQuery({
              project_id: projectId,
              database_id: database.resource_id,
              query: "SELECT 1;",
            })

            return {
              database,
              status: "healthy",
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error && error.message.length > 0
                ? error.message
                : "Health check failed"

            return {
              database,
              status: "unhealthy",
              errorMessage,
            }
          }
        }),
      )

      return checks
    },
    enabled: isAuthenticated && !!projectId,
    refetchInterval: DATABASE_HEALTH_CHECK_INTERVAL_MS,
  })
}

export {
  useAiQueryChat,
  type AiQueryChatErrorMessage,
  type AiQueryChatFixMessage,
  type AiQueryChatMessage,
  type AiQueryChatSendPayload,
  type AiQueryChatSqlMessage,
  type AiQueryChatUserFixMessage,
  type AiQueryChatUserTextMessage,
} from "./use-ai-query-chat"

export function useDeactivateResource(projectId: string, resourceId?: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: () => deactivateResource(projectId, resourceId as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "databases"] })
      qc.invalidateQueries({ queryKey: ["projects", projectId, "secrets"] })
      qc.invalidateQueries({
        queryKey: ["projects", projectId, "resources", resourceId, "database"],
      })
    },
  })
}

export function useResourceTags(projectId: string, resourceId?: string) {
  const { isAuthenticated } = useAuth()

  return useQuery<ProjectTagListResponse>({
    queryKey: ["projects", projectId, "resources", resourceId, "tags"],
    queryFn: () => listResourceTags(projectId, resourceId as string),
    enabled: isAuthenticated && !!projectId && resourceId !== undefined,
  })
}

export function useAttachResourceTag(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({
      resourceId,
      data,
    }: {
      resourceId: string
      data: AttachResourceTagRequest
    }) => attachResourceTag(projectId, resourceId, data),
    onSuccess: (_tag, variables) => {
      qc.invalidateQueries({
        queryKey: ["projects", projectId, "resources", variables.resourceId, "tags"],
      })
    },
  })
}

export function useCreateProject() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateProjectRequest) => createProject(data),
    onSuccess: (created) => {
      qc.setQueryData<ProjectListResponse>(PROJECTS_KEY, (old) => {
        if (!old) return { projects: [created] }
        return { projects: [...old.projects, created] }
      })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: PROJECTS_KEY })
    },
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...data }: UpdateProjectRequest & { id: string }) =>
      updateProject(id, data),
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: PROJECTS_KEY })
      const previous = qc.getQueryData<ProjectListResponse>(PROJECTS_KEY)

      qc.setQueryData<ProjectListResponse>(PROJECTS_KEY, (old) => {
        if (!old) return old
        return {
          projects: old.projects.map((p) =>
            p.id === variables.id
              ? {
                  ...p,
                  ...(variables.name !== undefined && { name: variables.name }),
                  ...(variables.description !== undefined && {
                    description: variables.description,
                  }),
                }
              : p,
          ),
        }
      })

      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(PROJECTS_KEY, context.previous)
      }
    },
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: PROJECTS_KEY })
      qc.invalidateQueries({ queryKey: ["projects", variables.id] })
    },
  })
}

export function useDeactivateProject() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (projectId: string) => deactivateProject(projectId),
    onMutate: async (projectId) => {
      await qc.cancelQueries({ queryKey: PROJECTS_KEY })
      const previous = qc.getQueryData<ProjectListResponse>(PROJECTS_KEY)

      qc.setQueryData<ProjectListResponse>(PROJECTS_KEY, (old) => {
        if (!old) return old
        return {
          projects: old.projects.filter((p) => p.id !== projectId),
        }
      })

      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        qc.setQueryData(PROJECTS_KEY, context.previous)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: PROJECTS_KEY })
    },
  })
}

export function useProject(projectId: string) {
  const { isAuthenticated } = useAuth()

  return useQuery<ProjectResponse>({
    queryKey: ["projects", projectId],
    queryFn: () => getProject(projectId),
    enabled: isAuthenticated && !!projectId,
  })
}

export function useSecrets(projectId: string) {
  const { isAuthenticated } = useAuth()

  return useQuery<SecretListResponse>({
    queryKey: ["projects", projectId, "secrets"],
    queryFn: () => listSecrets(projectId),
    enabled: isAuthenticated && !!projectId,
  })
}

export function useCreateSecret(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateSecretRequest) => createSecret(projectId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "secrets"] })
    },
  })
}

export function useUpdateSecretValue(projectId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({
      resourceId,
      ...data
    }: UpdateSecretValueRequest & { resourceId: string }) =>
      updateSecretValue(projectId, resourceId, data),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "secrets"] })
      qc.invalidateQueries({
        queryKey: [
          "projects",
          projectId,
          "resources",
          variables.resourceId,
          "secret",
          "value",
        ],
      })
    },
  })
}

export function useResources(projectId: string) {
  const { isAuthenticated } = useAuth()

  return useQuery<ProjectResourceListResponse>({
    queryKey: ["projects", projectId, "resources"],
    queryFn: () => listResources(projectId),
    enabled: isAuthenticated && !!projectId,
  })
}

export function useRevealSecretValue(projectId: string, resourceId?: string) {
  const qc = useQueryClient()

  return useMutation<RevealSecretValueResponse>({
    mutationFn: () => revealSecretValue(projectId, resourceId as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "secrets"] })
    },
  })
}

/** Fetches secret plaintext when the detail view is open (same API as reveal). */
export function useSecretValue(projectId: string, resourceId?: string) {
  const qc = useQueryClient()
  const { isAuthenticated } = useAuth()

  return useQuery<RevealSecretValueResponse>({
    queryKey: ["projects", projectId, "resources", resourceId, "secret", "value"],
    queryFn: async () => {
      const res = await revealSecretValue(projectId, resourceId as string)
      await qc.invalidateQueries({ queryKey: ["projects", projectId, "secrets"] })
      return res
    },
    enabled: isAuthenticated && !!projectId && resourceId !== undefined,
  })
}

export function useProjectTableCount(projectId: string) {
  const { data: dbData } = useDatabases(projectId)
  const databases = dbData?.databases ?? []

  return useQuery({
    queryKey: ["projects", projectId, "tableCount"],
    queryFn: async () => {
      const results = await Promise.all(
        databases.map((db) => listTables(projectId, db.resource_id)),
      )
      return results.reduce((sum, r) => sum + r.tables.length, 0)
    },
    enabled: databases.length > 0,
  })
}

export function useProjectMetricTimeseries(
  projectId: string,
  metric: string,
  resourceIds: string[],
) {
  const { isAuthenticated } = useAuth()

  return useQuery<ProjectMetricTimeseriesResult>({
    queryKey: ["projects", projectId, "observability", "timeseries", metric, resourceIds],
    queryFn: async () => {
      const perResourceSeries = await Promise.all(
        resourceIds.map(async (resourceId) => {
          try {
            return await getResourceMetricTimeseries(projectId, resourceId, metric)
          } catch {
            return null
          }
        }),
      )

      const aggregatedByTimestamp = new Map<string, number>()
      let unit = "bytes_per_second"
      const byResource: { resourceId: string; points: ObservabilityMetricPoint[] }[] = []

      for (let i = 0; i < perResourceSeries.length; i++) {
        const series = perResourceSeries[i]
        const resourceId = resourceIds[i]
        if (!resourceId) continue
        if (!series) continue
        unit = series.unit || unit

        if (series.points.length > 0) {
          byResource.push({
            resourceId,
            points: series.points,
          })
        }

        for (const point of series.points) {
          const current = aggregatedByTimestamp.get(point.timestamp) ?? 0
          aggregatedByTimestamp.set(point.timestamp, current + point.value)
        }
      }

      const points: ObservabilityMetricPoint[] = [...aggregatedByTimestamp.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([timestamp, value]) => ({ timestamp, value }))

      return { unit, points, byResource }
    },
    enabled: isAuthenticated && !!projectId && !!metric && resourceIds.length > 0,
  })
}

export function useProjectMetricsTimeseries(projectId: string, resourceIds: string[]) {
  const { isAuthenticated } = useAuth()

  return useQuery<ProjectMetricsTimeseries>({
    queryKey: ["projects", projectId, "observability", "timeseries", "all", resourceIds],
    queryFn: async () => {
      const byMetric = await Promise.all(
        PROJECT_TIMESERIES_METRICS.map(async (metric) => {
          const perResourceSeries = await Promise.all(
            resourceIds.map(async (resourceId) => {
              try {
                return await getResourceMetricTimeseries(projectId, resourceId, metric)
              } catch {
                return null
              }
            }),
          )

          const aggregatedByTimestamp = new Map<string, number>()
          let unit = "bytes_per_second"

          for (const series of perResourceSeries) {
            if (!series) continue
            unit = series.unit || unit

            for (const point of series.points) {
              const current = aggregatedByTimestamp.get(point.timestamp) ?? 0
              aggregatedByTimestamp.set(point.timestamp, current + point.value)
            }
          }

          const points: ObservabilityMetricPoint[] = [...aggregatedByTimestamp.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([timestamp, value]) => ({ timestamp, value }))

          return [metric, { unit, points }] as const
        }),
      )

      return Object.fromEntries(byMetric) as ProjectMetricsTimeseries
    },
    enabled: isAuthenticated && !!projectId && resourceIds.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}
