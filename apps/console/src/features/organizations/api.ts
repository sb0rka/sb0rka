import { apiRequest, apiRequestText } from "@/lib/api-client"

export const organizationRoles = ["owner", "admin", "member"] as const
export const assignableOrganizationRoles = ["member", "admin"] as const
export const invitationStatuses = ["pending", "accepted", "expired", "revoked", "declined"] as const

export type OrganizationRole = typeof organizationRoles[number]
export type AssignableOrganizationRole = typeof assignableOrganizationRoles[number]
export type InvitationStatus = typeof invitationStatuses[number]

export interface OrganizationMembership {
  user_id: string
  role: OrganizationRole
  created_at: string
  updated_at: string
}

export interface OrganizationMember extends OrganizationMembership {
  username?: string
  email?: string
}

export interface OrganizationFields {
  name: string
  description: string
}

export interface Organization {
  id: string
  name: string
  description?: string | null
  created_at: string
  updated_at: string
}

export interface OrganizationListItem extends Organization {
  member_count?: number
}

export interface OrganizationDetail extends Organization {
  members?: OrganizationMembership[]
}

export interface OrganizationInvitation {
  id: string
  organization_id: string
  organization_name: string
  role: AssignableOrganizationRole
  status: InvitationStatus
  email?: string | null
  username?: string | null
  created_by_username?: string | null
  expires_at?: string | null
}

export type InvitationFields =
  { role: AssignableOrganizationRole } & ({ email: string } | { username: string })

const organizationsPath = "/identity/organizations"
const organizationPath = (id: string) => organizationsPath + "/" + encodeURIComponent(id)
const invitationsPath = (id: string) => organizationPath(id) + "/invites"
const membersPath = (id: string) => organizationPath(id) + "/memberships"
const memberPath = (id: string, userId: string) => membersPath(id) + "/" + encodeURIComponent(userId)

export const organizationApi = {
  list: () => apiRequest<{ organizations: OrganizationListItem[] }>({ path: organizationsPath }),
  get: (id: string) => apiRequest<OrganizationDetail>({ path: organizationPath(id) }),
  create: (fields: OrganizationFields) => apiRequest<Organization>({
    path: organizationsPath, method: "POST", json: fields,
  }),
  update: (id: string, fields: OrganizationFields) => apiRequest<Organization>({
    path: organizationPath(id), method: "PATCH", json: fields,
  }),
  remove: (id: string) => apiRequest<void>({ path: organizationPath(id), method: "DELETE" }),
  members: (id: string) => apiRequest<{ id: string; members: OrganizationMember[] }>({
    path: membersPath(id),
  }),
  changeRole: (id: string, userId: string, role: AssignableOrganizationRole) =>
    apiRequest<OrganizationMembership>({
      path: memberPath(id, userId), method: "PATCH", json: { role },
    }),
  removeMember: (id: string, userId: string) =>
    apiRequest<void>({ path: memberPath(id, userId), method: "DELETE" }),
  invitations: (id: string) => apiRequest<{ invites: OrganizationInvitation[] }>({
    path: invitationsPath(id),
  }),
  invite: (id: string, fields: InvitationFields) => apiRequestText({
    path: invitationsPath(id), method: "POST", json: fields,
  }),
  revoke: (id: string, invitationId: string) => apiRequest<void>({
    path: invitationsPath(id) + "/" + encodeURIComponent(invitationId), method: "DELETE",
  }),
  currentInvitation: (id: string) => apiRequest<OrganizationInvitation>({
    path: invitationsPath(id) + "/current",
  }),
  declineInvitation: (id: string, inviteId: string) => apiRequest<void>({
    path: invitationsPath(id) + "/" + encodeURIComponent(inviteId) + "/decline", method: "POST",
  }),
  acceptInvitation: (id: string) => apiRequest<OrganizationMembership>({
    path: invitationsPath(id) + "/accept", method: "POST",
  }),
}
