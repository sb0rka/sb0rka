export const organizationsRoute = "/organizations"

export function organizationRoute(id: string) {
  return organizationsRoute + "/" + encodeURIComponent(id)
}

export function organizationInvitationRoute(id: string) {
  return organizationRoute(id) + "/invites/accept"
}

