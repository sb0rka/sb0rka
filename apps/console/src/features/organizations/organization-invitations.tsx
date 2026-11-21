import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import {
  Badge,
  type BadgeProps,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenuItem,
  Input,
  Label,
  useToast,
} from "@sb0rka/ui"
import { useConfirmDialog } from "@/components/confirm-dialog-provider"
import { useAuth } from "@/features/auth/auth-provider"
import { userIdentifier } from "@/features/auth/user-identifier"
import { OrganizationTable } from "./organization-table"
import { ApiError } from "@/lib/api-client"
import { formatDateTime } from "@/lib/format-date"
import {
  invitationStatuses,
  type AssignableOrganizationRole,
  type InvitationStatus,
  type OrganizationInvitation,
} from "./api"
import {
  OptionMenu,
  OrganizationActionMenu,
  OrganizationLoadError,
  OrganizationRoleMenu,
  OrganizationStatus,
} from "./components"
import {
  useInviteOrganizationMember,
  useOrganizationInvitations,
  useRevokeOrganizationInvitation,
} from "./hooks"
import { organizationInvitationRoute } from "./routes"
import { isOrganizationUnavailable, useOrganizationWrite } from "./use-organization-write"

const statusVariants = {
  pending: "inactive",
  accepted: "active",
  expired: "inactive",
  revoked: "destructive",
  declined: "destructive",
} satisfies Record<InvitationStatus, BadgeProps["variant"]>

export function OrganizationInvitations({
  id,
  canManage,
}: {
  id: string
  canManage: boolean
}) {
  const { t } = useTranslation()
  const confirm = useConfirmDialog()
  const { showSuccess, showError } = useToast()
  const invitationsQuery = useOrganizationInvitations(id)
  const revokeInvitation = useRevokeOrganizationInvitation(id)
  const { run, isWriting, verificationDialog } = useOrganizationWrite()
  const [status, setStatus] = useState("")

  if (invitationsQuery.isPending) return <OrganizationStatus loading />
  if (invitationsQuery.isError) {
    return (
      <OrganizationLoadError
        retry={() => void invitationsQuery.refetch()}
        unavailable={isOrganizationUnavailable(invitationsQuery.error)}
      />
    )
  }

  const invitations = invitationsQuery.data.invites
  const visibleInvitations = status
    ? invitations.filter((invite) => invite.status === status)
    : invitations
  const hasActions =
    canManage && visibleInvitations.some((invite) => invite.status === "pending")

  async function copyLink() {
    try {
      const link = new URL(organizationInvitationRoute(id), window.location.origin).href
      await navigator.clipboard.writeText(link)
      showSuccess(t("organizations.invitations.copied"))
    } catch {
      showError(t("common.messages.copyFailed"))
    }
  }

  async function revoke(invite: OrganizationInvitation, recipient: string) {
    const confirmed = await confirm({
      title: t("organizations.invitations.revokeTitle", { name: recipient }),
      description: t("organizations.invitations.revokeDescription"),
      confirmText: t("organizations.invitations.revoke"),
      confirmVariant: "destructive",
    })
    if (!confirmed) return
    const result = await run(() => revokeInvitation.mutateAsync(invite.id))
    if (result.ok) showSuccess(t("organizations.invitations.revoked"))
  }

  return (
    <>
      <OrganizationTable
        label={t("organizations.tabs.invitations")}
        filter={
          <OptionMenu
            label={t("common.labels.status")}
            value={status}
            onChange={setStatus}
            options={[
              { value: "", label: t("organizations.invitations.allStatuses") },
              ...invitationStatuses.map((value) => ({
                value,
                label: t("organizations.invitations.statuses." + value),
              })),
            ]}
          />
        }
        headings={
          <>
            <th scope="col">{t("organizations.invitations.recipient")}</th>
            <th scope="col" className="hidden w-[18%] text-center md:table-cell">
              {t("organizations.members.role")}
            </th>
            <th scope="col" className="hidden w-[18%] text-center md:table-cell">
              {t("common.labels.status")}
            </th>
            <th scope="col" className="hidden w-[16%] text-center lg:table-cell">
              {t("organizations.invitations.expires")}
            </th>
            <th scope="col" className="hidden w-[18%] text-center lg:table-cell">
              {t("organizations.invitations.invitedBy")}
            </th>
            {hasActions && (
              <th scope="col" className="hidden w-16 md:table-cell">
                <span className="sr-only">{t("organizations.members.actions")}</span>
              </th>
            )}
          </>
        }
        emptyMessage={
          visibleInvitations.length === 0
            ? t(
                invitations.length === 0
                  ? "organizations.invitations.empty"
                  : status === "pending"
                    ? "organizations.invitations.noPending"
                    : "organizations.noResults",
              )
            : undefined
        }
      >
        {visibleInvitations.map((invite) => {
          const name =
            invite.username || invite.email || t("organizations.invitations.unknownRecipient")
          const role = t("organizations.roles." + invite.role)
          const statusBadge = (
            <Badge variant={statusVariants[invite.status]} className="w-fit shrink-0">
              {t("organizations.invitations.statuses." + invite.status)}
            </Badge>
          )
          const expiry = formatDateTime(invite.expires_at)
          const actions =
            invite.status === "pending" ? (
              <OrganizationActionMenu
                label={t("organizations.members.actionsFor", { name })}
                disabled={isWriting}
              >
                <DropdownMenuItem onSelect={() => void copyLink()}>
                  {t("organizations.invitations.copy")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => void revoke(invite, name)}
                >
                  {t("organizations.invitations.revoke")}
                </DropdownMenuItem>
              </OrganizationActionMenu>
            ) : null
          return (
            <tr key={invite.id}>
              <td>
                <div className="flex items-start gap-3">
                  <p className="min-w-0 flex-1 break-all font-medium">{name}</p>
                  <div className="flex shrink-0 items-center gap-1 md:hidden [&_button]:h-5 [&_button]:w-5">
                    {statusBadge}
                    {actions}
                  </div>
                </div>
                {invite.email && invite.email !== name && (
                  <p className="break-all text-xs text-muted-foreground">{invite.email}</p>
                )}
                <p className="text-muted-foreground md:hidden">{role}</p>
                {invite.expires_at && (
                  <p className="text-xs text-muted-foreground lg:hidden">
                    {t("organizations.invitations.expires")} {expiry}
                  </p>
                )}
                {invite.created_by_username && (
                  <p className="break-all text-xs text-muted-foreground lg:hidden">
                    {t("organizations.invitations.invitedBy")} {invite.created_by_username}
                  </p>
                )}
              </td>
              <td className="hidden text-center md:table-cell">{role}</td>
              <td className="hidden text-center md:table-cell">{statusBadge}</td>
              <td className="hidden text-center lg:table-cell">{expiry}</td>
              <td className="hidden break-all text-center lg:table-cell">
                {invite.created_by_username || t("common.notAvailable")}
              </td>
              {hasActions && (
                <td className="hidden text-right md:table-cell">{actions}</td>
              )}
            </tr>
          )
        })}
      </OrganizationTable>
      {verificationDialog}
    </>
  )
}

export function InviteOrganizationMemberDialog({
  id,
  close,
  created,
}: {
  id: string
  close: () => void
  created: () => void
}) {
  const { t } = useTranslation()
  const { showSuccess, showError, showWarning } = useToast()
  const { user } = useAuth()
  const invite = useInviteOrganizationMember(id)
  const { run, isWriting, verificationDialog } = useOrganizationWrite()
  const [recipient, setRecipient] = useState("")
  const [role, setRole] = useState<AssignableOrganizationRole>("member")

  const value = recipient.trim()
  const selfInvite = Boolean(
    value &&
    user &&
    (value === user.username || value.toLowerCase() === user.email?.toLowerCase()),
  )

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!value || selfInvite) return
    const fields = { ...userIdentifier(value), role }
    const result = await run(
      () => invite.mutateAsync(fields),
      (error) => {
        if (!(error instanceof ApiError)) return false
        if (error.status === 400 && /cannot invite yourself/i.test(error.message)) {
          showError(t("organizations.errors.selfInvite"))
          return true
        }
        if (error.status === 404 && /user not found/i.test(error.message)) {
          showError(t("organizations.errors.unknownUser"))
          return true
        }
        if (
          error.status === 500 &&
          /failed to (send|build) invite email/i.test(error.message)
        ) {
          showWarning(t("organizations.errors.delivery"))
          created()
          return true
        }
        return false
      },
    )
    if (result.ok) {
      showSuccess(t("organizations.invitations.created"))
      created()
    }
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !isWriting) close()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("organizations.members.invite")}</DialogTitle>
            <DialogDescription>
              {t("organizations.invitations.createDescription")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <div className="flex flex-col gap-4 px-6">
              <div className="space-y-1.5">
                <Label htmlFor="organization-invite-recipient">
                  {t("auth.login.loginLabel")}
                </Label>
                <Input
                  id="organization-invite-recipient"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  aria-invalid={selfInvite}
                  aria-describedby={selfInvite ? "invite-self-error" : undefined}
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  disabled={isWriting}
                  required
                />
                {selfInvite && (
                  <p id="invite-self-error" role="alert" className="text-sm text-destructive">
                    {t("organizations.errors.selfInvite")}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="organization-invite-role">
                  {t("organizations.members.role")}
                </Label>
                <OrganizationRoleMenu
                  id="organization-invite-role"
                  value={role}
                  onChange={setRole}
                  disabled={isWriting}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={isWriting} onClick={close}>
                {t("common.actions.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isWriting || !value || selfInvite}
                aria-busy={isWriting}
              >
                {t(isWriting ? "common.creating" : "organizations.invitations.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {verificationDialog}
    </>
  )
}
