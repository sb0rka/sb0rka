import type { OrganizationMemberResponse, OrganizationResponse } from "./api"
import { isMemberRole, type MemberRole } from "./roles"

export function callerOrganizationRole(
  members: OrganizationMemberResponse[] | undefined,
  userId: string | undefined,
): MemberRole | undefined {
  if (!userId || !members) return undefined
  const role = members.find((member) => member.user_id === userId)?.role
  return role && isMemberRole(role) ? role : undefined
}

export function organizationRoleFromProfile(
  organization: OrganizationResponse | undefined,
  userId: string | undefined,
): MemberRole | undefined {
  return callerOrganizationRole(organization?.members, userId)
}

export function countOwners(members: OrganizationMemberResponse[] | undefined): number {
  return (members ?? []).filter((member) => member.role === "owner").length
}
