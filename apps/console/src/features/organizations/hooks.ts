import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth/auth-provider"
import { ApiError } from "@/lib/api-client"
import {
  acceptOrganizationInvite,
  createOrganization,
  getCurrentOrganizationInvite,
  createOrganizationInvite,
  deleteOrganization,
  getOrganization,
  listOrganizationInvites,
  listOrganizationMembers,
  listOrganizations,
  removeOrganizationMember,
  revokeOrganizationInvite,
  updateOrganization,
  updateOrganizationMemberRole,
} from "./api"
import type {
  CreateOrganizationInviteRequest,
  CreateOrganizationRequest,
  OrganizationListResponse,
  OrganizationMemberListResponse,
  UpdateOrganizationMemberRequest,
  UpdateOrganizationRequest,
} from "./api"
import type { MemberRole } from "./roles"

export const ORGANIZATIONS_KEY = ["organizations"] as const

export function useOrganizations() {
  const { isAuthenticated } = useAuth()

  return useQuery<OrganizationListResponse>({
    queryKey: ORGANIZATIONS_KEY,
    queryFn: listOrganizations,
    enabled: isAuthenticated,
  })
}

export function useOrganization(organizationId: string) {
  const { isAuthenticated } = useAuth()

  return useQuery({
    queryKey: ["organizations", organizationId],
    queryFn: () => getOrganization(organizationId),
    enabled: isAuthenticated && !!organizationId,
  })
}

export function useCreateOrganization() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateOrganizationRequest) => createOrganization(data),
    onSuccess: (created) => {
      qc.setQueryData<OrganizationListResponse>(ORGANIZATIONS_KEY, (old) => {
        if (!old) return { organizations: [created] }
        return { organizations: [created, ...old.organizations] }
      })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ORGANIZATIONS_KEY })
    },
  })
}

export function useUpdateOrganization(organizationId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateOrganizationRequest) => updateOrganization(organizationId, data),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ORGANIZATIONS_KEY })
      qc.invalidateQueries({ queryKey: ["organizations", organizationId] })
    },
  })
}

export function useDeleteOrganization() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (organizationId: string) => deleteOrganization(organizationId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ORGANIZATIONS_KEY })
    },
  })
}

export function useOrganizationMembers(organizationId: string) {
  const { isAuthenticated } = useAuth()

  return useQuery<OrganizationMemberListResponse>({
    queryKey: ["organizations", organizationId, "members"],
    queryFn: () => listOrganizationMembers(organizationId),
    enabled: isAuthenticated && !!organizationId,
  })
}

export function useUpdateOrganizationMemberRole(organizationId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: MemberRole }) =>
      updateOrganizationMemberRole(organizationId, userId, {
        role,
      } satisfies UpdateOrganizationMemberRequest),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["organizations", organizationId, "members"] })
      qc.invalidateQueries({ queryKey: ["organizations", organizationId] })
    },
  })
}

export function useRemoveOrganizationMember(organizationId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (userId: string) => removeOrganizationMember(organizationId, userId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["organizations", organizationId, "members"] })
      qc.invalidateQueries({ queryKey: ORGANIZATIONS_KEY })
      qc.invalidateQueries({ queryKey: ["organizations", organizationId] })
    },
  })
}

export function useOrganizationInvites(organizationId: string) {
  const { isAuthenticated } = useAuth()

  return useQuery({
    queryKey: ["organizations", organizationId, "invites"],
    queryFn: () => listOrganizationInvites(organizationId),
    enabled: isAuthenticated && !!organizationId,
  })
}

export function useInviteOrganizationMember(organizationId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateOrganizationInviteRequest) =>
      createOrganizationInvite(organizationId, data),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["organizations", organizationId, "invites"] })
    },
  })
}

export function useRevokeOrganizationInvite(organizationId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (inviteId: string) => revokeOrganizationInvite(organizationId, inviteId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["organizations", organizationId, "invites"] })
    },
  })
}

export function useCurrentOrganizationInvite(organizationId: string) {
  const { isAuthenticated } = useAuth()

  return useQuery({
    queryKey: ["organizations", organizationId, "invites", "current"],
    queryFn: () => getCurrentOrganizationInvite(organizationId),
    enabled: isAuthenticated && !!organizationId,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && (error.status === 404 || error.status === 403)) &&
      failureCount < 2,
  })
}

export function useAcceptOrganizationInvite(organizationId: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: () => acceptOrganizationInvite(organizationId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ORGANIZATIONS_KEY })
      qc.invalidateQueries({ queryKey: ["organizations", organizationId] })
      qc.invalidateQueries({ queryKey: ["organizations", organizationId, "members"] })
    },
  })
}
