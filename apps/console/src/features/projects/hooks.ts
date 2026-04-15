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
  deactivateResource,
  createSecret,
} from "./api"
import type {
  ProjectResponse,
  ProjectListResponse,
  DatabaseListResponse,
  CreateDatabaseRequest,
  CreateProjectRequest,
  UpdateProjectRequest,
  SecretListResponse,
  CreateSecretRequest,
  AttachResourceTagRequest,
  ProjectTagListResponse,
  DatabaseResponse,
  UpdateDatabaseRequest,
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

export function useDatabases(projectId: string) {
  const { isAuthenticated } = useAuth()

  return useQuery<DatabaseListResponse>({
    queryKey: ["projects", projectId, "databases"],
    queryFn: () => listDatabases(projectId),
    enabled: isAuthenticated && !!projectId,
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

export function useDeactivateResource(projectId: string, resourceId?: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: () => deactivateResource(projectId, resourceId as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "databases"] })
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
    onSettled: () => {
      qc.invalidateQueries({ queryKey: PROJECTS_KEY })
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
