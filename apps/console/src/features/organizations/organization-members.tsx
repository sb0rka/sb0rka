import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenuItem,
  Label,
  useToast,
} from "@sb0rka/ui"
import { useConfirmDialog } from "@/components/confirm-dialog-provider"
import { formatDateTime } from "@/lib/format-date"
import {
  organizationRoles,
  type AssignableOrganizationRole,
  type OrganizationMember,
  type OrganizationRole,
} from "./api"
import {
  OptionMenu,
  OrganizationActionMenu,
  OrganizationLoadError,
  OrganizationRoleMenu,
  OrganizationStatus,
} from "./components"
import {
  useChangeOrganizationRole,
  useOrganizationMembers,
  useRemoveOrganizationMember,
} from "./hooks"
import { OrganizationTable } from "./organization-table"
import { organizationsRoute } from "./routes"
import { isOrganizationUnavailable, useOrganizationWrite } from "./use-organization-write"

const memberName = (member: OrganizationMember) =>
  member.username || member.email || member.user_id

function canChangeRole(
  actor: OrganizationRole | undefined,
  target: OrganizationMember,
  userId: string,
) {
  if (target.user_id === userId || target.role === "owner") return false
  return actor === "owner" || (actor === "admin" && target.role === "member")
}

export function OrganizationMembers({ id, userId }: { id: string; userId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const confirm = useConfirmDialog()
  const { showSuccess } = useToast()
  const membersQuery = useOrganizationMembers(id)
  const changeRole = useChangeOrganizationRole(id)
  const removeMember = useRemoveOrganizationMember(id)
  const { run, isWriting, verificationDialog } = useOrganizationWrite()
  const [roleFilter, setRoleFilter] = useState("")
  const [editingUserId, setEditingUserId] = useState<string | null>(null)

  if (membersQuery.isPending) return <OrganizationStatus loading />
  if (membersQuery.isError) {
    return (
      <OrganizationLoadError
        retry={() => void membersQuery.refetch()}
        unavailable={isOrganizationUnavailable(membersQuery.error)}
      />
    )
  }

  const members = membersQuery.data.members
  const actorRole = members.find((member) => member.user_id === userId)?.role
  const ownerCount = members.filter((member) => member.role === "owner").length
  const visibleMembers = roleFilter
    ? members.filter((member) => member.role === roleFilter)
    : members
  function canRemove(member: OrganizationMember) {
    if (member.role === "owner") return actorRole === "owner" && ownerCount > 1
    return actorRole === "owner" || actorRole === "admin"
  }
  const hasActions = visibleMembers.some(canRemove)
  const editingMember = members.find((member) => member.user_id === editingUserId)

  async function remove(member: OrganizationMember) {
    const isSelf = member.user_id === userId
    const confirmed = await confirm({
      title: isSelf
        ? t("organizations.members.leaveTitle")
        : t("organizations.members.removeTitle", { name: memberName(member) }),
      description: t(
        isSelf
          ? "organizations.members.leaveDescription"
          : "organizations.members.removeDescription",
      ),
      confirmText: t(isSelf ? "organizations.members.leave" : "organizations.members.remove"),
      confirmVariant: "destructive",
    })
    if (!confirmed) return
    const result = await run(() => removeMember.mutateAsync(member.user_id))
    if (!result.ok) return
    showSuccess(t(isSelf ? "organizations.members.left" : "organizations.members.removed"))
    if (isSelf) navigate(organizationsRoute, { replace: true })
  }

  async function saveRole(member: OrganizationMember, role: AssignableOrganizationRole) {
    if (!canChangeRole(actorRole, member, userId)) return
    const result = await run(() => changeRole.mutateAsync({ userId: member.user_id, role }))
    if (!result.ok) return
    setEditingUserId(null)
    showSuccess(t("organizations.members.roleChanged"))
  }

  return (
    <>
      <OrganizationTable
        label={t("organizations.tabs.members")}
        filter={
          <OptionMenu
            label={t("organizations.members.role")}
            value={roleFilter}
            onChange={setRoleFilter}
            options={[
              { value: "", label: t("organizations.members.allRoles") },
              ...organizationRoles.map((role) => ({
                value: role,
                label: t("organizations.roles." + role),
              })),
            ]}
          />
        }
        headings={
          <>
            <th scope="col">{t("organizations.members.account")}</th>
            <th scope="col" className="hidden w-1/5 text-center md:table-cell">
              {t("organizations.members.role")}
            </th>
            <th scope="col" className="hidden w-1/5 text-center md:table-cell">
              {t("organizations.members.joined")}
            </th>
            {hasActions && (
              <th scope="col" className="w-16">
                <span className="sr-only">{t("organizations.members.actions")}</span>
              </th>
            )}
          </>
        }
        emptyMessage={
          visibleMembers.length === 0
            ? t(members.length ? "organizations.noResults" : "organizations.members.empty")
            : undefined
        }
      >
        {visibleMembers.map((member) => {
          const name = memberName(member)
          const isSelf = member.user_id === userId
          const role = t("organizations.roles." + member.role)
          const joined = formatDateTime(member.created_at)
          return (
            <tr key={member.user_id}>
              <td>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 break-all font-medium">{name}</span>
                  {isSelf && (
                    <Badge variant="inactive">{t("organizations.members.you")}</Badge>
                  )}
                </div>
                {member.email && member.email !== name && (
                  <p className="break-all text-xs text-muted-foreground">
                    {member.email}
                  </p>
                )}
                <p className="text-muted-foreground md:hidden">
                  {role} · {joined}
                </p>
              </td>
              <td className="hidden text-center md:table-cell">{role}</td>
              <td className="hidden text-center md:table-cell">{joined}</td>
              {hasActions && (
                <td className="text-right">
                  {canRemove(member) && (
                    <OrganizationActionMenu
                      label={t("organizations.members.actionsFor", { name })}
                      disabled={isWriting}
                    >
                      {canChangeRole(actorRole, member, userId) && (
                        <DropdownMenuItem onSelect={() => setEditingUserId(member.user_id)}>
                          {t("organizations.members.changeRole")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => void remove(member)}
                      >
                        {t(
                          isSelf
                            ? "organizations.members.leave"
                            : "organizations.members.remove",
                        )}
                      </DropdownMenuItem>
                    </OrganizationActionMenu>
                  )}
                </td>
              )}
            </tr>
          )
        })}
      </OrganizationTable>
      {editingMember && canChangeRole(actorRole, editingMember, userId) && (
        <EditRoleDialog
          key={editingMember.user_id}
          member={editingMember}
          busy={isWriting}
          close={() => setEditingUserId(null)}
          save={(role) => void saveRole(editingMember, role)}
        />
      )}
      {verificationDialog}
    </>
  )
}

function EditRoleDialog({
  member,
  busy,
  close,
  save,
}: {
  member: OrganizationMember
  busy: boolean
  close: () => void
  save: (role: AssignableOrganizationRole) => void
}) {
  const { t } = useTranslation()
  const [role, setRole] = useState<AssignableOrganizationRole | "">(
    member.role === "owner" ? "" : member.role,
  )
  const canSubmit = (role === "admin" || role === "member") && role !== member.role && !busy

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (canSubmit) save(role)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("organizations.members.changeRoleTitle", { name: memberName(member) })}
          </DialogTitle>
          <DialogDescription>
            {t("organizations.members.changeRoleDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="flex flex-col gap-1.5 px-6">
            <Label htmlFor="organization-member-role">{t("organizations.members.role")}</Label>
            <OrganizationRoleMenu
              id="organization-member-role"
              value={role}
              onChange={setRole}
              disabled={busy}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={close}>
              {t("common.actions.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit} aria-busy={busy}>
              {t(busy ? "common.saving" : "common.actions.saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
