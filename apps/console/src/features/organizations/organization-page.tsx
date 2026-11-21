import { useState } from "react"
import { Building } from "lucide-react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
  Label,
  useToast,
} from "@sb0rka/ui"
import { useConfirmDialog } from "@/components/confirm-dialog-provider"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import { useAuth } from "@/features/auth/auth-provider"
import type { Organization, OrganizationFields, OrganizationRole } from "./api"
import {
  OrganizationFieldsForm,
  OrganizationLoadError,
  OrganizationStatus,
} from "./components"
import {
  useDeleteOrganization,
  useOrganization,
  useUpdateOrganization,
} from "./hooks"
import {
  InviteOrganizationMemberDialog,
  OrganizationInvitations,
} from "./organization-invitations"
import { OrganizationMembers } from "./organization-members"
import { organizationSections, organizationTab, organizationTabRoute } from "./navigation"
import { organizationsRoute } from "./routes"
import { isOrganizationUnavailable, useOrganizationWrite } from "./use-organization-write"

export function OrganizationPage() {
  const { id = "" } = useParams()
  const { user } = useAuth()
  const { t } = useTranslation()

  if (!user || !id) {
    return (
      <OrganizationStatus error>{t("organizations.errors.unavailable")}</OrganizationStatus>
    )
  }
  return <OrganizationDetail key={id} id={id} userId={user.id} />
}

function OrganizationDetail({ id, userId }: { id: string; userId: string }) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [inviteOpen, setInviteOpen] = useState(false)
  const organization = useOrganization(id)
  const tab = organizationTab(searchParams.get("tab"))

  if (organization.isPending) return <OrganizationStatus loading />
  if (organization.isError) {
    return (
      <OrganizationLoadError
        retry={() => void organization.refetch()}
        unavailable={isOrganizationUnavailable(organization.error)}
      />
    )
  }

  const detail = organization.data
  const role = detail.members?.find((member) => member.user_id === userId)?.role
  const canManage = role === "owner" || role === "admin"

  return (
    <PageStagger
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-6",
        tab !== "settings" &&
          "h-[calc(100dvh-11rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] md:h-[calc(100dvh-7.25rem)] md:flex-none",
      )}
    >
      <SlideIn className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {tab === "settings"
            ? t("organizations.settings.heading")
            : t(organizationSections[tab].labelKey)}
        </h1>
        {canManage && tab !== "settings" && (
          <Button
            aria-label={t("organizations.members.invite")}
            onClick={() => setInviteOpen(true)}
          >
            <span className="sm:hidden">{t("organizations.members.inviteShort")}</span>
            <span className="hidden sm:inline">{t("organizations.members.invite")}</span>
          </Button>
        )}
      </SlideIn>
      {tab === "members" && <OrganizationMembers id={id} userId={userId} />}
      {tab === "invitations" && <OrganizationInvitations id={id} canManage={canManage} />}
      {tab === "settings" && <OrganizationSettings organization={detail} role={role} />}

      {canManage && inviteOpen && (
        <InviteOrganizationMemberDialog
          id={id}
          close={() => setInviteOpen(false)}
          created={() => {
            setInviteOpen(false)
            if (tab !== "invitations") navigate(organizationTabRoute(id, "invitations"))
          }}
        />
      )}
    </PageStagger>
  )
}

function OrganizationSettings({
  organization,
  role,
}: {
  organization: Organization
  role?: OrganizationRole
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const confirm = useConfirmDialog()
  const { showSuccess } = useToast()
  const update = useUpdateOrganization(organization.id)
  const remove = useDeleteOrganization(organization.id)
  const { run, isWriting, verificationDialog } = useOrganizationWrite()
  const canEdit = role === "owner" || role === "admin"

  async function save(fields: OrganizationFields) {
    const result = await run(() => update.mutateAsync(fields))
    if (result.ok) showSuccess(t("organizations.settings.saved"))
    return result.ok
  }

  async function deleteOrganization() {
    const confirmation = organization.name.trim().replace(/\s+/g, " ") || organization.id
    const confirmed = await confirm({
      title: t("organizations.settings.deleteTitle"),
      description: t("organizations.settings.deleteDescription"),
      infoNode: (
        <div className="flex flex-col items-center gap-3 px-6">
          <Building className="h-8 w-8 shrink-0" id="icon" />
          <Label htmlFor="icon" className="text-lg">{confirmation}</Label>
          <p>{t("organizations.settings.typeNameToConfirm")}</p>
        </div>
      ),
      strongConfirmValue: confirmation,
      confirmText: t("common.actions.delete"),
      cancelText: t("common.actions.cancel"),
      confirmVariant: "destructive",
    })
    if (!confirmed) return
    const result = await run(() => remove.mutateAsync(undefined))
    if (!result.ok) return
    showSuccess(t("organizations.settings.deleted"))
    navigate(organizationsRoute, { replace: true })
  }

  return (
    <SlideIn className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl leading-5">
            {t("organizations.settings.title")}
          </CardTitle>
        </CardHeader>
        {canEdit ? (
          <OrganizationFieldsForm
            initialFields={{
              name: organization.name,
              description: organization.description ?? "",
            }}
            busy={isWriting}
            requireChange
            submitLabel={t(isWriting ? "common.saving" : "common.actions.saveChanges")}
            onSave={save}
          />
        ) : (
          <CardContent>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="font-medium">{t("common.labels.name")}</dt>
                <dd className="break-words text-muted-foreground">{organization.name}</dd>
              </div>
              <div>
                <dt className="font-medium">{t("common.labels.description")}</dt>
                <dd className="whitespace-pre-wrap break-words text-muted-foreground">
                  {organization.description || t("common.notAvailable")}
                </dd>
              </div>
            </dl>
          </CardContent>
        )}
      </Card>
      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-xl leading-5">
            {t("projects.settings.dangerTitle")}
          </CardTitle>
        </CardHeader>
        <CardFooter className="items-start pt-6">
          <Button
            variant="delete"
            disabled={isWriting || role !== "owner"}
            onClick={() => void deleteOrganization()}
          >
            {t("organizations.settings.delete")}
          </Button>
          {role !== "owner" && (
            <p className="text-sm text-muted-foreground">
              {t("organizations.settings.ownerOnly")}
            </p>
          )}
        </CardFooter>
      </Card>
      {verificationDialog}
    </SlideIn>
  )
}
