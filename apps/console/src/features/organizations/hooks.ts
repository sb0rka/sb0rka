import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { ApiError } from "@/lib/api-client"
import {
  organizationApi,
  type AssignableOrganizationRole,
  type InvitationFields,
  type OrganizationFields,
} from "./api"

const organizationKeys = {
  list: ["organizations", "list"] as const,
  detail: (id: string) => ["organizations", "detail", id] as const,
  members: (id: string) => ["organizations", "detail", id, "members"] as const,
  invitations: (id: string) => ["organizations", "detail", id, "invitations"] as const,
  currentInvitation: (id: string) => ["organizations", "detail", id, "current-invitation"] as const,
}

const queryOptions = {
  staleTime: 0,
  refetchOnWindowFocus: true,
  retry: (failureCount: number, error: Error) =>
    failureCount === 0 && (!(error instanceof ApiError) || error.status >= 500),
}

export function useOrganizations(enabled = true) {
  return useQuery({
    ...queryOptions,
    queryKey: organizationKeys.list,
    queryFn: organizationApi.list,
    enabled,
  })
}

export function useOrganizationMemberships(organizationIds: string[], userId: string) {
  return useQueries({
    queries: organizationIds.map((id) => ({
      ...queryOptions,
      queryKey: [...organizationKeys.members(id), userId],
      queryFn: () => organizationApi.member(id, userId),
      enabled: Boolean(userId),
    })),
  })
}

export function useOrganization(id: string, enabled = true) {
  return useQuery({
    ...queryOptions,
    queryKey: organizationKeys.detail(id),
    queryFn: () => organizationApi.get(id),
    enabled,
  })
}

export function useOrganizationMembers(id: string) {
  return useQuery({
    ...queryOptions,
    queryKey: organizationKeys.members(id),
    queryFn: () => organizationApi.members(id),
  })
}

export function useOrganizationInvitations(id: string) {
  return useQuery({
    ...queryOptions,
    queryKey: organizationKeys.invitations(id),
    queryFn: () => organizationApi.invitations(id),
    refetchInterval: 60_000,
  })
}

export function useCurrentOrganizationInvitation(id: string) {
  return useQuery({
    ...queryOptions,
    queryKey: organizationKeys.currentInvitation(id),
    queryFn: () => organizationApi.currentInvitation(id),
  })
}

export function useCreateOrganization() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: organizationApi.create,
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: organizationKeys.list }) },
  })
}

function useOrganizationMutation<T, R>(id: string, mutationFn: (variables: T) => Promise<R>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSettled: async () => {
      // A conflict, permission change, or email delivery failure can leave the cached lists stale.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: organizationKeys.detail(id) }),
        queryClient.invalidateQueries({ queryKey: organizationKeys.list }),
      ])
    },
  })
}

export function useUpdateOrganization(id: string) {
  return useOrganizationMutation(id, (fields: OrganizationFields) => organizationApi.update(id, fields))
}

export function useDeleteOrganization(id: string) {
  return useOrganizationMutation(id, () => organizationApi.remove(id))
}

export function useChangeOrganizationRole(id: string) {
  return useOrganizationMutation(id, ({ userId, role }: { userId: string; role: AssignableOrganizationRole }) =>
    organizationApi.changeRole(id, userId, role))
}

export function useRemoveOrganizationMember(id: string) {
  return useOrganizationMutation(id, (userId: string) => organizationApi.removeMember(id, userId))
}

export function useInviteOrganizationMember(id: string) {
  return useOrganizationMutation(id, (fields: InvitationFields) => organizationApi.invite(id, fields))
}

export function useRevokeOrganizationInvitation(id: string) {
  return useOrganizationMutation(id, (invitationId: string) => organizationApi.revoke(id, invitationId))
}

export function useAcceptOrganizationInvitation(id: string) {
  return useOrganizationMutation(id, () => organizationApi.acceptInvitation(id))
}

export function useDeclineOrganizationInvitation(id: string) {
  return useOrganizationMutation(id, (inviteId: string) => organizationApi.declineInvitation(id, inviteId))
}
