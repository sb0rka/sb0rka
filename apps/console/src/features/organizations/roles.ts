export const MEMBER_ROLES = ["owner", "admin", "member"] as const

export type MemberRole = (typeof MEMBER_ROLES)[number]

export function isMemberRole(value: string): value is MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(value)
}

export function canManageOrganizationMembers(role: string | undefined): boolean {
  return role === "owner" || role === "admin"
}

export function organizationInviteRoles(callerRole: string): MemberRole[] {
  if (callerRole === "owner" || callerRole === "admin") return ["admin", "member"]
  return []
}

export function canEditOrganization(role: string | undefined): boolean {
  return role === "owner" || role === "admin"
}

/** Owner is shown when it is the current role. The API does not allow assigning it. */
export function organizationRoleOptions(
  callerRole: string | undefined,
  currentRole: string,
): MemberRole[] {
  if (callerRole !== "owner" && callerRole !== "admin") {
    return isMemberRole(currentRole) ? [currentRole] : []
  }

  const options: MemberRole[] = []
  if (currentRole === "owner") options.push("owner")
  if (callerRole === "owner" || currentRole !== "owner") {
    options.push("admin", "member")
  }
  return options
}
