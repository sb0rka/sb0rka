import { useState } from "react"
import { Link, Outlet, useNavigate, useParams } from "react-router-dom"
import { Trans, useTranslation } from "react-i18next"
import { Button, useToast } from "@sb0rka/ui"
import { useAuth } from "@/features/auth/auth-provider"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import { LoginPage } from "@/features/auth/login-page"
import { ApiError } from "@/lib/api-client"
import { OrganizationLoadError, OrganizationStatus } from "./components"
import {
  useAcceptOrganizationInvitation,
  useCurrentOrganizationInvitation,
  useDeclineOrganizationInvitation,
  useOrganization,
} from "./hooks"
import { organizationsRoute, organizationRoute } from "./routes"
import { isOrganizationUnavailable, useOrganizationWrite } from "./use-organization-write"

export function OrganizationInvitationEntry() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return null
  // Login updates the auth context. Keeping this route mounted preserves the invitation link.
  if (!isAuthenticated) return <LoginPage onLoginSuccess={() => undefined} />
  return <Outlet />
}

export function OrganizationInvitationPage() {
  const { id = "" } = useParams()
  const { t } = useTranslation()
  const { user } = useAuth()

  return (
    <PageStagger className="flex flex-col gap-6">
      <SlideIn className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("organizations.accept.title")}
        </h1>
        {user && id && <InvitationLead id={id} />}
      </SlideIn>
      <SlideIn>
        {user && id ? (
          <Invitation key={id} id={id} />
        ) : (
          <OrganizationStatus error>
            {t("organizations.accept.unavailable")}
          </OrganizationStatus>
        )}
      </SlideIn>
    </PageStagger>
  )
}

function InvitationLead({ id }: { id: string }) {
  const { t } = useTranslation()
  const invitation = useCurrentOrganizationInvitation(id)
  const invite = invitation.data
  if (!invite) return null
  const role = t("organizations.roles." + invite.role)
  const name = <span className="text-foreground" />
  return (
    <p className="break-words text-sm leading-5 text-muted-foreground">
      {invite.created_by_username ? (
        <Trans
          i18nKey="organizations.accept.invitedBy"
          values={{ inviter: invite.created_by_username, name: invite.organization_name, role }}
          components={[
            <span className="text-foreground" />,
            <span className="text-foreground" />,
            <span className="text-foreground" />,
          ]}
        />
      ) : (
        <Trans
          i18nKey="organizations.accept.description"
          values={{ name: invite.organization_name, role }}
          components={[name, <span className="text-foreground" />]}
        />
      )}
    </p>
  )
}

function Invitation({ id }: { id: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showSuccess } = useToast()
  const invitation = useCurrentOrganizationInvitation(id)
  const accept = useAcceptOrganizationInvitation(id)
  const decline = useDeclineOrganizationInvitation(id)
  const { run, isWriting, verificationDialog } = useOrganizationWrite()
  const [invitationChanged, setInvitationChanged] = useState(false)
  const noInvitation = invitationChanged || isOrganizationUnavailable(invitation.error)
  const organization = useOrganization(id, noInvitation)

  async function join() {
    const result = await run(
      () => accept.mutateAsync(undefined),
      (error) => {
        if (error instanceof ApiError && [404, 409].includes(error.status)) {
          setInvitationChanged(true)
          return true
        }
        return false
      },
    )
    if (!result.ok) return
    showSuccess(t("organizations.accept.accepted"))
    navigate(organizationRoute(id), { replace: true })
  }

  async function declineInvite(inviteId: string) {
    const result = await run(() => decline.mutateAsync(inviteId))
    if (result.ok) {
      showSuccess(t("organizations.accept.declined"))
      navigate(organizationsRoute, { replace: true })
    }
  }

  const invite = invitation.data
  let content
  if (noInvitation) {
    if (organization.isPending) {
      content = <OrganizationStatus loading />
    } else if (organization.isSuccess) {
      content = (
        <OrganizationStatus
          action={
            <Button asChild>
              <Link to={organizationRoute(id)}>{t("organizations.accept.open")}</Link>
            </Button>
          }
        >
          {t("organizations.accept.alreadyMember")}
        </OrganizationStatus>
      )
    } else if (isOrganizationUnavailable(organization.error)) {
      content = (
        <OrganizationStatus error>{t("organizations.accept.unavailable")}</OrganizationStatus>
      )
    } else {
      content = <OrganizationLoadError retry={() => void organization.refetch()} />
    }
  } else if (invitation.isError) {
    content = <OrganizationLoadError retry={() => void invitation.refetch()} />
  } else if (invite) {
    content = (
      <>
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={isWriting || invitation.isFetching}
            aria-busy={isWriting}
            onClick={() => void join()}
          >
            {t("organizations.accept.submit")}
          </Button>
          <Button
            variant="outline"
            disabled={isWriting || invitation.isFetching}
            onClick={() => void declineInvite(invite.id)}
          >
            {t("organizations.accept.decline")}
          </Button>
        </div>
      </>
    )
  } else {
    content = <OrganizationStatus loading />
  }

  return (
    <div className="flex flex-col gap-4">
      {content}
      {verificationDialog}
    </div>
  )
}
