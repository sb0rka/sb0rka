import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Trans, useTranslation } from "react-i18next"
import { Button, Card, CardFooter, CardHeader } from "@sb0rka/ui"
import { ApiError } from "@/lib/api-client"
import { useAcceptOrganizationInvite, useCurrentOrganizationInvite } from "./hooks"
import { isMemberRole } from "./roles"

function formatExpiry(value: string | undefined, locale: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export function AcceptOrganizationInvitePage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { orgId = "" } = useParams<{ orgId: string }>()
  const inviteQuery = useCurrentOrganizationInvite(orgId)
  const acceptInvite = useAcceptOrganizationInvite(orgId)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const invite = inviteQuery.data
  const roleLabel =
    invite && isMemberRole(invite.role) ? t(`roles.${invite.role}`) : invite?.role
  const organizationName = invite?.organization_name?.trim() || t("organizations.fallback")
  const inviterName = invite?.created_by_username?.trim()
  const expiry = formatExpiry(invite?.expires_at, i18n.language)
  const expiryText = expiry ? t("organizations.accept.expires", { date: expiry }) : null

  async function handleAccept() {
    setErrorMessage(null)
    try {
      await acceptInvite.mutateAsync()
      navigate(`/organizations/${orgId}`, { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        navigate(`/organizations/${orgId}`, { replace: true })
        return
      }
      setErrorMessage(
        error instanceof ApiError && error.message
          ? error.message
          : t("organizations.accept.fallbackError"),
      )
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col py-10">
      <Card className="shadow-sm">
        <CardHeader>
          {inviteQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : inviteQuery.isError &&
            inviteQuery.error instanceof ApiError &&
            inviteQuery.error.status === 404 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("organizations.accept.notFound")}
            </p>
          ) : inviteQuery.isError ? (
            <p className="text-sm text-destructive">{t("organizations.loadError")}</p>
          ) : invite ? (
            <p className="text-base leading-relaxed text-muted-foreground">
              <Trans
                i18nKey={
                  inviterName
                    ? "organizations.accept.invitedBy"
                    : "organizations.accept.invitedByUnknown"
                }
                values={{
                  name: inviterName,
                  organization: organizationName,
                  role: roleLabel,
                }}
                components={{
                  name: <strong className="font-bold text-foreground" />,
                  org: <strong className="font-bold text-foreground" />,
                }}
              />
              {expiryText ? <> {expiryText}</> : null}
            </p>
          ) : null}
          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
        </CardHeader>
        <CardFooter className="flex gap-2">
          {invite ? (
            <Button disabled={acceptInvite.isPending} onClick={() => void handleAccept()}>
              {acceptInvite.isPending ? t("common.loading") : t("organizations.invite.accept")}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => navigate("/organizations")}>
            {t("common.actions.cancel")}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
