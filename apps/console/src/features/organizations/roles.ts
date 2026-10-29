export const MEMBER_ROLES = ["owner", "admin", "editor", "viewer"] as const

export type MemberRole = (typeof MEMBER_ROLES)[number]

const ROLE_RANK: Record<MemberRole, number> = {
  owner: 4,
  admin: 3,
  editor: 2,
  viewer: 1,
}

export function isMemberRole(value: string): value is MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(value)
}

export function memberRoleRank(role: string): number {
  return isMemberRole(role) ? ROLE_RANK[role] : 0
}

/** A project member may grant only strictly lower roles. */
export function canAssignProjectRole(callerRole: string, targetRole: string): boolean {
  const callerRank = memberRoleRank(callerRole)
  const targetRank = memberRoleRank(targetRole)
  return callerRank > 0 && targetRank > 0 && targetRank < callerRank
}

export function assignableProjectRoles(callerRole: string): MemberRole[] {
  return MEMBER_ROLES.filter((role) => canAssignProjectRole(callerRole, role))
}

export function canManageOrganizationMembers(role: string | undefined): boolean {
  return role === "owner" || role === "admin"
}

export function organizationInviteRoles(callerRole: string): MemberRole[] {
  if (callerRole === "owner") return [...MEMBER_ROLES]
  if (callerRole === "admin") return ["admin", "editor", "viewer"]
  return []
}

export function canEditOrganization(role: string | undefined): boolean {
  return role === "owner" || role === "admin" || role === "editor"
}
