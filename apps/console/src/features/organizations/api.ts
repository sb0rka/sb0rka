import { apiRequest } from "@/lib/api-client"
import type { MemberRole } from "./roles"

export interface OrganizationResponse {
  id: string
  name: string
  description?: string
  created_at: string
  updated_at: string
  members?: OrganizationMemberResponse[]
}

export interface OrganizationListResponse {
  organizations: OrganizationResponse[]
}

export interface CreateOrganizationRequest {
  name: string
  description?: string
}

export interface UpdateOrganizationRequest {
  name?: string
  description?: string
}

export interface OrganizationMemberResponse {
  user_id: string
  role: MemberRole | string
  created_at: string
  updated_at: string
}

export interface OrganizationMemberListResponse {
  id: string
  members: OrganizationMemberResponse[]
}

export interface CreateOrganizationMemberRequest {
  user_id: string
  role: MemberRole
}

export interface UpdateOrganizationMemberRequest {
  role: MemberRole
}

export interface OrganizationMemberInviteResponse {
  id: string
  organization_id: string
  organization_name?: string
  role: MemberRole | string
  status: "pending" | "accepted" | "expired" | "revoked" | string
  email?: string
  username?: string
  created_by_user_id?: string
  created_at: string
  expires_at?: string
}

export interface OrganizationMemberInviteListResponse {
  invites: OrganizationMemberInviteResponse[]
}

export interface CreateOrganizationInviteRequest {
  username?: string
  email?: string
  role: MemberRole
}

export async function listOrganizations(): Promise<OrganizationListResponse> {
  return apiRequest<OrganizationListResponse>({
    path: "/identity/organizations",
    base: "auth",
  })
}

export async function getOrganization(organizationId: string): Promise<OrganizationResponse> {
  return apiRequest<OrganizationResponse>({
    path: `/identity/organizations/${organizationId}`,
    base: "auth",
  })
}

export async function createOrganization(
  data: CreateOrganizationRequest,
): Promise<OrganizationResponse> {
  return apiRequest<OrganizationResponse>({
    method: "POST",
    path: "/identity/organizations",
    json: data,
    base: "auth",
  })
}

export async function updateOrganization(
  organizationId: string,
  data: UpdateOrganizationRequest,
): Promise<OrganizationResponse> {
  return apiRequest<OrganizationResponse>({
    method: "PATCH",
    path: `/identity/organizations/${organizationId}`,
    json: data,
    base: "auth",
  })
}

export async function deleteOrganization(organizationId: string): Promise<void> {
  return apiRequest<void>({
    method: "DELETE",
    path: `/identity/organizations/${organizationId}`,
    base: "auth",
  })
}

export async function listOrganizationMembers(
  organizationId: string,
): Promise<OrganizationMemberListResponse> {
  return apiRequest<OrganizationMemberListResponse>({
    path: `/identity/organizations/${organizationId}/memberships`,
    base: "auth",
  })
}

export async function updateOrganizationMemberRole(
  organizationId: string,
  userId: string,
  data: UpdateOrganizationMemberRequest,
): Promise<OrganizationMemberResponse> {
  return apiRequest<OrganizationMemberResponse>({
    method: "PATCH",
    path: `/identity/organizations/${organizationId}/memberships/${userId}`,
    json: data,
    base: "auth",
  })
}

export async function removeOrganizationMember(
  organizationId: string,
  userId: string,
): Promise<void> {
  return apiRequest<void>({
    method: "DELETE",
    path: `/identity/organizations/${organizationId}/memberships/${userId}`,
    base: "auth",
  })
}

export async function listOrganizationInvites(
  organizationId: string,
): Promise<OrganizationMemberInviteListResponse> {
  return apiRequest<OrganizationMemberInviteListResponse>({
    path: `/identity/organizations/${organizationId}/invites`,
    base: "auth",
  })
}

export async function createOrganizationInvite(
  organizationId: string,
  data: CreateOrganizationInviteRequest,
): Promise<OrganizationMemberInviteResponse> {
  return apiRequest<OrganizationMemberInviteResponse>({
    method: "POST",
    path: `/identity/organizations/${organizationId}/invites`,
    json: data,
    base: "auth",
  })
}

export async function revokeOrganizationInvite(
  organizationId: string,
  inviteId: string,
): Promise<void> {
  return apiRequest<void>({
    method: "POST",
    path: `/identity/organizations/${organizationId}/invites/${inviteId}/revoke`,
    base: "auth",
  })
}

export async function listMyOrganizationInvites(): Promise<OrganizationMemberInviteListResponse> {
  return apiRequest<OrganizationMemberInviteListResponse>({
    path: "/identity/organizations/invites",
    base: "auth",
  })
}

export async function acceptOrganizationInvite(inviteId: string): Promise<void> {
  return apiRequest<void>({
    method: "POST",
    path: `/identity/organizations/invites/${inviteId}/accept`,
    base: "auth",
  })
}

export async function declineOrganizationInvite(inviteId: string): Promise<void> {
  return apiRequest<void>({
    method: "POST",
    path: `/identity/organizations/invites/${inviteId}/decline`,
    base: "auth",
  })
}
