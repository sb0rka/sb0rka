import { Building, DoorClosedLocked, Send, Settings, Users } from "lucide-react"
import { useMatch, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useOrganization } from "./hooks"
import { organizationRoute, organizationsRoute } from "./routes"

export const organizationSections = {
  members: { icon: Users, labelKey: "organizations.tabs.members" },
  access: { icon: DoorClosedLocked, labelKey: "organizations.tabs.access" },
  invitations: { icon: Send, labelKey: "organizations.tabs.invitations" },
  settings: { icon: Settings, labelKey: "organizations.tabs.settings" },
} as const

export type OrganizationTab = keyof typeof organizationSections

export function organizationTab(value: string | null): OrganizationTab {
  return value === "access" || value === "invitations" || value === "settings" ? value : "members"
}

export function organizationTabRoute(id: string, tab: OrganizationTab) {
  const path = organizationRoute(id)
  return tab === "members" ? path : path + "?tab=" + tab
}

function organizationNavigation(id: string, activeTab: OrganizationTab) {
  const tabs: OrganizationTab[] = ["members", "access", "invitations", "settings"]
  return tabs.map((tab) => ({
    ...organizationSections[tab],
    href: organizationTabRoute(id, tab),
    isActive: activeTab === tab,
    dividerBefore: tab === "settings",
  }))
}

export function useOrganizationNavigation() {
  const { t } = useTranslation()
  const match = useMatch("/organizations/:id")
  const invitation = useMatch("/organizations/:id/invites/accept")
  const [params] = useSearchParams()
  const id = match?.params.id ?? ""
  const detail = useOrganization(id, !!id)

  if (!match && !invitation) return undefined
  const root = { label: t("nav.organizations"), href: organizationsRoute, icon: Building }
  if (invitation) {
    return { breadcrumbs: [root, { label: t("organizations.accept.title") }] }
  }

  const name = detail.data?.name ?? t("organizations.fallbackName")
  const tab = organizationTab(params.get("tab"))
  const section = organizationSections[tab]
  return {
    sidebar: { name, items: organizationNavigation(id, tab) },
    breadcrumbs: [
      root,
      { label: name, href: organizationRoute(id) },
      { label: t(section.labelKey), icon: section.icon },
    ],
  }
}
