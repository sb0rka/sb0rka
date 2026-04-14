import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth/auth-provider"
import {
  listProjects,
  listDatabases,
  createProject,
  updateProject,
  deactivateProject,
  getProject,
  listTables,
  listSecrets,
} from "./api"
import type {
  ProjectResponse,
  ProjectListResponse,
  DatabaseListResponse,
  CreateProjectRequest,
  UpdateProjectRequest,
  SecretListResponse,
} from "./api"

const PROJECTS_KEY = ["projects"] as const

export function useProjects() {
  const { isAuthenticated } = useAuth()

  return useQuery<ProjectListResponse>({
    queryKey: PROJECTS_KEY,
    queryFn: listProjects,
    enabled: isAuthenticated,
  })
}

export function useDatabases(projectId: number) {
  const { isAuthenticated } = useAuth()

  return useQuery<DatabaseListResponse>({
    queryKey: ["projects", projectId, "databases"],
    queryFn: () => listDatabases(projectId),
    enabled: isAuthenticated,
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
    mutationFn: ({ id, ...data }: UpdateProjectRequest & { id: number }) =>
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
    onSettled: () => {
      qc.invalidateQueries({ queryKey: PROJECTS_KEY })
    },
  })
}

export function useDeactivateProject() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (projectId: number) => deactivateProject(projectId),
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

export function useProject(projectId: number) {
  const { isAuthenticated } = useAuth()

  return useQuery<ProjectResponse>({
    queryKey: ["projects", projectId],
    queryFn: () => getProject(projectId),
    enabled: isAuthenticated && projectId > 0,
  })
}

export function useSecrets(projectId: number) {
  const { isAuthenticated } = useAuth()

  return useQuery<SecretListResponse>({
    queryKey: ["projects", projectId, "secrets"],
    queryFn: () => listSecrets(projectId),
    enabled: isAuthenticated && projectId > 0,
  })
}

export function useProjectTableCount(projectId: number) {
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
