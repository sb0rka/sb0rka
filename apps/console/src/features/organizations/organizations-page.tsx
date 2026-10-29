import { useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Building2, Copy, Plus } from "lucide-react"
import {
  Badge,
  Button,
  buttonPressClass,
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
  FloatingHint,
} from "@sb0rka/ui"
import { getResolvedLanguage } from "@/lib/i18n"
import { useAuth } from "@/features/auth/auth-provider"
import { useProjects } from "@/features/projects/hooks"
import { PageStagger, SlideIn, StaggerGroup } from "@/components/motion/page-entrance"
import { CreateOrganizationDialog } from "./create-organization-dialog"
import {
  useAcceptOrganizationInvite,
  useDeclineOrganizationInvite,
  useMyOrganizationInvites,
  useOrganizations,
} from "./hooks"
import { organizationRoleFromProfile } from "./membership"
import type { OrganizationResponse } from "./api"
import { isMemberRole } from "./roles"

function formatInviteExpiry(value: string | undefined, locale: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date)
}

function OrganizationCard({
  organization,
  projectCount,
  roleLabel,
}: {
  organization: OrganizationResponse
  projectCount: number
  roleLabel?: string
}) {
  const { t } = useTranslation()
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const memberCount = organization.members?.length

  async function handleCopyId() {
    try {
      await navigator.clipboard.writeText(organization.id)
      setCopyMessage(t("organizations.idCopied"))
      window.setTimeout(() => setCopyMessage(null), 2000)
    } catch {
      setCopyMessage(t("common.messages.copyFailed"))
      window.setTimeout(() => setCopyMessage(null), 3000)
    }
  }

  return (
    <Card className="flex h-full flex-col shadow-sm">
      <CardHeader className="flex flex-1 flex-col gap-3 px-6 pb-4 pt-6">
        <div className="flex w-full items-start gap-3">
          <CardTitle className="min-w-0 flex-1 truncate text-xl font-semibold leading-normal tracking-[-0.3px]">
            {organization.name}
          </CardTitle>
          {roleLabel ? (
            <Badge className="shrink-0 px-2.5 py-0.5 text-xs font-semibold leading-4">
              {roleLabel}
            </Badge>
          ) : null}
        </div>
        <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">
          {organization.description || t("organizations.noDescription")}
        </p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="size-4 shrink-0" />
          <span>
            {t("organizations.summary", {
              members: memberCount ?? "—",
              projects: projectCount,
            })}
          </span>
        </p>
      </CardHeader>
      <CardFooter className="mt-auto flex flex-row flex-wrap items-center gap-6 px-6 pb-6 pt-0">
        <div className="relative min-w-0 flex-1 basis-[min-content]">
          <button
            type="button"
            onClick={() => void handleCopyId()}
            className={cn("flex w-full min-w-0 items-center gap-2", buttonPressClass)}
            aria-label={t("organizations.copyId")}
          >
            <Copy className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-left text-sm leading-5 text-muted-foreground">
              {organization.id}
            </span>
          </button>
          <FloatingHint message={copyMessage} placement="bottom" align="start" />
        </div>
        <Button className="shrink-0" asChild>
          <Link to={`/organizations/${organization.id}`}>{t("common.actions.open")}</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

export function OrganizationsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [createOpen, setCreateOpen] = useState(false)
  const organizationsQuery = useOrganizations()
  const invitesQuery = useMyOrganizationInvites()
  const projectsQuery = useProjects()
  const acceptInvite = useAcceptOrganizationInvite()
  const declineInvite = useDeclineOrganizationInvite()
  const organizations = organizationsQuery.data?.organizations ?? []
  const pendingInvites = (invitesQuery.data?.invites ?? []).filter(
    (invite) => invite.status === "pending",
  )
  const locale = getResolvedLanguage()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {organizationsQuery.isLoading ? (
        <div className="flex min-h-[500px] flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </div>
      ) : (
        <PageStagger className="flex min-h-0 flex-1 flex-col gap-4">
          <SlideIn className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">{t("organizations.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("organizations.subtitle")}</p>
            </div>
            <Button
              size="icon"
              className="size-9 shrink-0 rounded-xl md:h-9 md:w-auto md:rounded-md md:px-4"
              onClick={() => setCreateOpen(true)}
              aria-label={t("organizations.create")}
            >
              <Plus className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">{t("organizations.create")}</span>
            </Button>
          </SlideIn>

          {pendingInvites.length > 0 ? (
            <SlideIn className="flex flex-col gap-3">
              {pendingInvites.map((invite) => {
                const knownOrg = organizations.find(
                  (organization) => organization.id === invite.organization_id,
                )
                const orgLabel =
                  invite.organization_name ?? knownOrg?.name ?? invite.organization_id
                const expiry = formatInviteExpiry(invite.expires_at, locale)
                const roleLabel = isMemberRole(invite.role)
                  ? t(`roles.${invite.role}`)
                  : invite.role
                return (
                  <div
                    key={invite.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {t("organizations.invite.title", { name: orgLabel })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("organizations.invite.meta", { role: roleLabel })}
                        {expiry
                          ? ` · ${t("organizations.invite.expires", { date: expiry })}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        disabled={declineInvite.isPending}
                        onClick={() => declineInvite.mutate(invite.id)}
                      >
                        {t("organizations.invite.decline")}
                      </Button>
                      <Button
                        disabled={acceptInvite.isPending}
                        onClick={() => acceptInvite.mutate(invite.id)}
                      >
                        {t("organizations.invite.accept")}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </SlideIn>
          ) : null}

          {organizationsQuery.isError ? (
            <SlideIn>
              <p className="text-sm text-destructive">{t("organizations.loadError")}</p>
            </SlideIn>
          ) : organizations.length === 0 ? (
            <SlideIn className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-border shadow-sm">
              <div className="flex flex-col items-center gap-1 px-6 text-center">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">
                  {t("organizations.emptyTitle")}
                </h2>
                <p className="text-sm tracking-tight text-muted-foreground">
                  {t("organizations.emptyDescription")}
                </p>
                <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("organizations.create")}
                </Button>
              </div>
            </SlideIn>
          ) : (
            <StaggerGroup className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),450px))] [&>*]:h-full">
              {organizations.map((organization) => {
                const role = organizationRoleFromProfile(organization, user?.id)
                const projectCount = (projectsQuery.data?.projects ?? []).filter(
                  (project) => project.owner_subject_id === organization.id,
                ).length
                return (
                  <SlideIn key={organization.id} className="h-full max-w-[450px]">
                    <OrganizationCard
                      organization={organization}
                      projectCount={projectCount}
                      roleLabel={role ? t(`roles.${role}`) : undefined}
                    />
                  </SlideIn>
                )
              })}
            </StaggerGroup>
          )}
        </PageStagger>
      )}

      <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
