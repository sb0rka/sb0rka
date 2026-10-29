import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus } from "lucide-react"
import { Badge, Button, useToast } from "@sb0rka/ui"
import { ApiError } from "@/lib/api-client"
import { useAuth } from "@/features/auth/auth-provider"
import { InviteMemberDialog } from "./invite-member-dialog"
import {
  useOrganizationInvites,
  useOrganizationMembers,
  useRemoveOrganizationMember,
  useRevokeOrganizationInvite,
  useUpdateOrganizationMemberRole,
} from "../hooks"
import { countOwners } from "../membership"
import {
  canManageOrganizationMembers,
  isMemberRole,
  MEMBER_ROLES,
  type MemberRole,
} from "../roles"

function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

interface OrgMembersTabProps {
  organizationId: string
  callerRole: MemberRole | undefined
}

export function OrgMembersTab({ organizationId, callerRole }: OrgMembersTabProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showError } = useToast()
  const [inviteOpen, setInviteOpen] = useState(false)
  const membersQuery = useOrganizationMembers(organizationId)
  const invitesQuery = useOrganizationInvites(organizationId)
  const updateRole = useUpdateOrganizationMemberRole(organizationId)
  const removeMember = useRemoveOrganizationMember(organizationId)
  const revokeInvite = useRevokeOrganizationInvite(organizationId)
  const members = membersQuery.data?.members ?? []
  const ownerCount = countOwners(members)
  const canManage = canManageOrganizationMembers(callerRole)
  const pendingInvites = (invitesQuery.data?.invites ?? []).filter(
    (invite) => invite.status === "pending",
  )

  function roleOptions(currentRole: string): MemberRole[] {
    if (callerRole !== "owner" && callerRole !== "admin") return []
    return MEMBER_ROLES.filter((role) => {
      if (role === currentRole) return true
      if (currentRole === "owner" || role === "owner") return callerRole === "owner"
      return callerRole === "owner" || callerRole === "admin"
    })
  }

  async function handleRoleChange(userId: string, currentRole: string, nextRole: string) {
    if (!isMemberRole(nextRole) || nextRole === currentRole) return
    if (currentRole === "owner" && nextRole !== "owner" && ownerCount <= 1) return
    try {
      await updateRole.mutateAsync({ userId, role: nextRole })
    } catch (error) {
      showError(errorText(error, t("organizations.members.updateError")))
    }
  }

  async function handleRemove(userId: string) {
    try {
      await removeMember.mutateAsync(userId)
    } catch (error) {
      showError(errorText(error, t("organizations.members.removeError")))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("organizations.members.description")}</p>
        {canManage && callerRole ? (
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("organizations.invite.submit")}
          </Button>
        ) : null}
      </div>

      {membersQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t("organizations.members.member")}</th>
                <th className="px-4 py-3 font-medium">{t("common.labels.status")}</th>
                <th className="px-4 py-3 font-medium">{t("organizations.members.role")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("organizations.members.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isSelf = member.user_id === user?.id
                const isLastOwner = member.role === "owner" && ownerCount <= 1
                const options = roleOptions(member.role)
                const canChangeRole = canManage && options.length > 1 && !isLastOwner
                const canRemove =
                  canManage &&
                  !isSelf &&
                  !isLastOwner &&
                  (member.role !== "owner" || callerRole === "owner")
                return (
                  <tr key={member.user_id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {isSelf ? t("organizations.members.you") : member.user_id}
                      </p>
                      {!isSelf ? (
                        <p className="font-mono text-xs text-muted-foreground">{member.user_id}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">{user?.email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="active">{t("organizations.members.active")}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm disabled:opacity-60"
                          value={member.role}
                          disabled={!canChangeRole || updateRole.isPending}
                          aria-label={t("organizations.members.role")}
                          onChange={(event) =>
                            void handleRoleChange(member.user_id, member.role, event.target.value)
                          }
                        >
                          {(options.length > 0 ? options : MEMBER_ROLES.filter((role) => role === member.role)).map(
                            (role) => (
                              <option key={role} value={role}>
                                {t(`roles.${role}`)}
                              </option>
                            ),
                          )}
                        </select>
                        {isLastOwner ? (
                          <span className="text-xs text-muted-foreground">
                            {t("organizations.members.lastOwner")}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canRemove ? (
                        <Button
                          variant="outline"
                          disabled={removeMember.isPending}
                          onClick={() => void handleRemove(member.user_id)}
                        >
                          {t("organizations.members.remove")}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {isLastOwner ? t("organizations.members.protected") : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {pendingInvites.map((invite) => (
                <tr key={invite.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {invite.username ?? invite.email ?? invite.id}
                    </p>
                    {invite.email && invite.username ? (
                      <p className="text-xs text-muted-foreground">{invite.email}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge>{t("organizations.members.invitePending")}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {isMemberRole(invite.role) ? t(`roles.${invite.role}`) : invite.role}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage ? (
                      <Button
                        variant="outline"
                        disabled={revokeInvite.isPending}
                        onClick={() => revokeInvite.mutate(invite.id)}
                      >
                        {t("organizations.invite.revoke")}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-sm text-muted-foreground">{t("organizations.members.invariant")}</p>

      {callerRole ? (
        <InviteMemberDialog
          organizationId={organizationId}
          callerRole={callerRole}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
        />
      ) : null}
    </div>
  )
}
