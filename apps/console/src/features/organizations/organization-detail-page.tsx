import { useMemo } from "react"
import { useParams, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "@sb0rka/ui"
import { useAuth } from "@/features/auth/auth-provider"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import { OrgMembersTab } from "./components/org-members-tab"
import { OrgProjectsTab } from "./components/org-projects-tab"
import { OrgSettingsTab } from "./components/org-settings-tab"
import { useOrganization, useOrganizationMembers } from "./hooks"
import { callerOrganizationRole } from "./membership"

const ORG_TABS = ["projects", "members", "settings"] as const
type OrgTab = (typeof ORG_TABS)[number]

function isOrgTab(value: string | null): value is OrgTab {
  return value !== null && (ORG_TABS as readonly string[]).includes(value)
}

export function OrganizationDetailPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { orgId = "" } = useParams<{ orgId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get("tab")
  const activeTab: OrgTab = isOrgTab(tabParam) ? tabParam : "projects"
  const organizationQuery = useOrganization(orgId)
  const membersQuery = useOrganizationMembers(orgId)
  const organization = organizationQuery.data
  const callerRole = useMemo(
    () => callerOrganizationRole(membersQuery.data?.members ?? organization?.members, user?.id),
    [membersQuery.data?.members, organization?.members, user?.id],
  )

  if (organizationQuery.isLoading) {
    return (
      <div className="flex min-h-[400px] flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    )
  }

  if (!organization) {
    return (
      <div className="flex min-h-[400px] flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("organizations.notFound")}</p>
      </div>
    )
  }

  return (
    <PageStagger className="flex flex-col gap-6">
      <SlideIn className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-foreground">{organization.name}</h1>
        {callerRole ? (
          <Badge>{t("organizations.yourRole", { role: t(`roles.${callerRole}`) })}</Badge>
        ) : null}
      </SlideIn>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setSearchParams({ tab: value })}
      >
        <TabsList className="grid w-full grid-cols-3 md:w-auto md:grid-cols-3">
          <TabsTrigger value="projects">{t("organizations.tabs.projects")}</TabsTrigger>
          <TabsTrigger value="members">{t("organizations.tabs.members")}</TabsTrigger>
          <TabsTrigger value="settings">{t("organizations.tabs.settings")}</TabsTrigger>
        </TabsList>
        <TabsContent value="projects" className="mt-4">
          <OrgProjectsTab organizationId={orgId} callerRole={callerRole} />
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          <OrgMembersTab organizationId={orgId} callerRole={callerRole} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <OrgSettingsTab
            organizationId={orgId}
            name={organization.name}
            description={organization.description ?? ""}
            callerRole={callerRole}
          />
        </TabsContent>
      </Tabs>
    </PageStagger>
  )
}
