import { useState, type FormEvent } from "react"
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
import {
  assignableProjectRoles,
  type AssignableProjectRole,
  type ProjectMember,
} from "@/features/projects/api"
import { useProjectMembers, useProjects, useRemoveProjectMember, useUpdateProjectMemberRole } from "@/features/projects/hooks"
import { ApiError } from "@/lib/api-client"
import { formatDateTime } from "@/lib/format-date"
import type { OrganizationMember } from "./api"
import { AddToProjectDialog } from "./add-to-project-dialog"
import {
  OptionMenu,
  OrganizationActionMenu,
  OrganizationLoadError,
  OrganizationStatus,
} from "./components"
import { useOrganizationMembers } from "./hooks"
import { OrganizationTable } from "./organization-table"

const roleRank = { viewer: 1, editor: 2, admin: 3, owner: 4 } as const

function accessStatusVariant(role: ProjectMember["role"] | undefined) {
  if (!role) return "inactive" as const
  if (role === "owner" || role === "admin") return "destructive" as const
  return "active" as const
}

function canChangeRole(actor: ProjectMember["role"] | undefined, target: ProjectMember["role"]) {
  if (target === "agent" || target === "owner" || !actor || actor === "agent") return false
  return roleRank[target] < roleRank[actor]
}

function canRevokeAccess(
  actor: ProjectMember["role"] | undefined,
  target: ProjectMember["role"],
  ownerCount: number,
) {
  if (!actor || actor === "agent") return false
  if (target === "owner") return actor === "owner" && ownerCount > 1
  if (actor === "owner") return true
  return actor === "admin" && target !== "admin"
}

function rolesActorCanAssign(actor: ProjectMember["role"] | undefined) {
  if (!actor || actor === "agent") return []
  return assignableProjectRoles.filter((role) => roleRank[role] < roleRank[actor])
}

export function OrganizationAccess({ id, userId }: { id: string; userId: string }) {
  const { t } = useTranslation()
  const confirm = useConfirmDialog()
  const { showSuccess, showError } = useToast()
  const [selectedId, setSelectedId] = useState("")
  const [adding, setAdding] = useState<{ projectId: string; userId: string } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const projectList = useProjects()
  const organizationMembers = useOrganizationMembers(id)
  const projects = projectList.data?.projects.filter((project) => project.owner_subject_id === id) ?? []
  const selected = projects.find((project) => project.public_id === selectedId) ?? projects[0]
  const projectMembers = useProjectMembers(selected?.public_id ?? "")
  const updateRole = useUpdateProjectMemberRole(selected?.public_id ?? "")
  const removeMember = useRemoveProjectMember(selected?.public_id ?? "")

  if (projectList.isError || organizationMembers.isError) {
    return (
      <OrganizationLoadError
        retry={() => {
          if (projectList.isError) void projectList.refetch()
          if (organizationMembers.isError) void organizationMembers.refetch()
        }}
      />
    )
  }
  if (projectList.isPending || organizationMembers.isPending) return <OrganizationStatus loading />
  if (!selected) return <OrganizationStatus>{t("organizations.addToProject.empty")}</OrganizationStatus>

  const memberships = new Map(
    projectMembers.data?.members.map((member) => [member.subject_id, member]),
  )
  const ownerCount = [...memberships.values()].filter((member) => member.role === "owner").length
  const actorRole = memberships.get(userId)?.role
  const canAdd = projectMembers.isSuccess && (actorRole === "owner" || actorRole === "admin")
  const members = [...organizationMembers.data.members].sort((left, right) => {
    const leftAdded = Date.parse(memberships.get(left.user_id)?.created_at ?? "") || 0
    const rightAdded = Date.parse(memberships.get(right.user_id)?.created_at ?? "") || 0
    return rightAdded - leftAdded
  })
  const addingMember =
    adding?.projectId === selected.public_id
      ? members.find((member) => member.user_id === adding.userId)
      : undefined
  const editingMember = members.find((member) => member.user_id === editingId)
  const editingMembership = editingMember ? memberships.get(editingMember.user_id) : undefined

  function memberActions(member: OrganizationMember, membership: ProjectMember | undefined) {
    const canEdit = member.user_id !== userId && Boolean(membership && canChangeRole(actorRole, membership.role))
    const canRevoke = member.user_id !== userId && Boolean(membership && canRevokeAccess(actorRole, membership.role, ownerCount))
    const canGrant = !membership && canAdd
    if (!canEdit && !canGrant && !canRevoke) return null
    const name = member.username || member.email || member.user_id
    const busy = updateRole.isPending || removeMember.isPending
    return (
      <OrganizationActionMenu
        label={t("organizations.members.actionsFor", { name })}
        disabled={busy}
      >
        {canGrant && (
          <DropdownMenuItem
            onSelect={() => setAdding({ projectId: selected.public_id, userId: member.user_id })}
          >
            {t("common.actions.add")}
          </DropdownMenuItem>
        )}
        {canEdit && (
          <DropdownMenuItem onSelect={() => setEditingId(member.user_id)}>
            {t("organizations.members.changeRole")}
          </DropdownMenuItem>
        )}
        {canRevoke && (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => void revokeAccess(member.user_id)}
          >
            {t("organizations.addToProject.revoke")}
          </DropdownMenuItem>
        )}
      </OrganizationActionMenu>
    )
  }

  async function revokeAccess(subjectId: string) {
    const confirmed = await confirm({
      title: t("organizations.addToProject.revokeTitle"),
      description: t("organizations.addToProject.revokeDescription"),
      confirmText: t("organizations.addToProject.revoke"),
      confirmVariant: "destructive",
    })
    if (!confirmed) return
    removeMember.mutate(subjectId, {
      onSuccess: () => showSuccess(t("organizations.addToProject.revoked")),
      onError: (error) => showError(t(changeRoleErrorKey(error instanceof Error ? error : new Error()))),
    })
  }

  const rows = projectMembers.isSuccess
    ? members.map((member) => ({ member, actions: memberActions(member, memberships.get(member.user_id)) }))
    : []
  const hasActions = rows.some((row) => row.actions)
  const columnCount = 4 + (hasActions ? 1 : 0)

  return (
    <>
      <OrganizationTable
        label={t("organizations.tabs.access")}
        filter={
          <OptionMenu
            label={t("projects.fallbackProject")}
            value={selected.public_id}
            options={projects.map((project) => ({ value: project.public_id, label: project.name }))}
            onChange={(projectId) => {
              setSelectedId(projectId)
              setAdding(null)
              setEditingId(null)
            }}
          />
        }
        headings={
          <>
            <th scope="col">{t("organizations.members.account")}</th>
            <th scope="col" className="hidden w-1/5 text-center md:table-cell">
              {t("common.labels.status")}
            </th>
            <th scope="col" className="hidden w-1/5 text-center md:table-cell">
              {t("common.labels.createdAt")}
            </th>
            <th scope="col" className="hidden w-1/5 text-center md:table-cell">
              {t("common.labels.updatedAt")}
            </th>
            {hasActions && (
              <th scope="col" className="w-16">
                <span className="sr-only">{t("organizations.members.actions")}</span>
              </th>
            )}
          </>
        }
        emptyMessage={
          projectMembers.isSuccess && members.length === 0
            ? t("organizations.members.empty")
            : undefined
        }
      >
        {projectMembers.isSuccess ? (
          rows.map(({ member, actions }) => {
            const name = member.username || member.email || member.user_id
            const isSelf = member.user_id === userId
            const membership = memberships.get(member.user_id)
            const created = formatDateTime(membership?.created_at)
            const updated = formatDateTime(membership?.updated_at)
            const statusBadge = (
              <Badge
                variant={accessStatusVariant(membership?.role)}
                className="w-fit shrink-0"
              >
                {membership
                  ? t(`organizations.addToProject.roles.${membership.role}`)
                  : t("organizations.addToProject.notAdded")}
              </Badge>
            )
            return (
              <tr key={member.user_id}>
                <td>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 break-all font-medium">{name}</span>
                    {isSelf && (
                      <Badge variant="inactive">{t("organizations.members.you")}</Badge>
                    )}
                    <span className="md:hidden">{statusBadge}</span>
                  </div>
                  {member.email && member.email !== name && (
                    <p className="break-all text-xs text-muted-foreground">{member.email}</p>
                  )}
                  {membership && (
                    <p className="text-muted-foreground md:hidden">
                      {created} · {updated}
                    </p>
                  )}
                </td>
                <td className="hidden text-center md:table-cell">{statusBadge}</td>
                <td className="hidden text-center md:table-cell">{created}</td>
                <td className="hidden text-center md:table-cell">{updated}</td>
                {hasActions && <td className="text-right">{actions}</td>}
              </tr>
            )
          })
        ) : (
          <tr>
            <td colSpan={columnCount} className="text-muted-foreground">
              {projectMembers.isError ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span role="alert">{t("organizations.addToProject.loadError")}</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => void projectMembers.refetch()}>
                    {t("organizations.retry")}
                  </Button>
                </div>
              ) : (
                <span role="status">{t("common.loading")}</span>
              )}
            </td>
          </tr>
        )}
      </OrganizationTable>
      {addingMember && (
        <AddToProjectDialog
          memberId={addingMember.user_id}
          memberName={addingMember.username || addingMember.email || addingMember.user_id}
          project={selected}
          canAssignAdmin={actorRole === "owner"}
          canAdd={canAdd && !memberships.has(addingMember.user_id)}
          close={() => setAdding(null)}
        />
      )}
      {editingMember && editingMembership && canChangeRole(actorRole, editingMembership.role) && (
        <ChangeProjectRoleDialog
          key={editingMember.user_id}
          currentRole={editingMembership.role}
          roles={rolesActorCanAssign(actorRole)}
          busy={updateRole.isPending}
          error={updateRole.error}
          close={() => {
            updateRole.reset()
            setEditingId(null)
          }}
          save={(role) =>
            updateRole.mutate(
              { subjectId: editingMember.user_id, role },
              {
                onSuccess: () => {
                  showSuccess(t("organizations.addToProject.roleChanged"))
                  setEditingId(null)
                },
              },
            )
          }
        />
      )}
    </>
  )
}

function ChangeProjectRoleDialog({
  currentRole,
  roles,
  busy,
  error,
  close,
  save,
}: {
  currentRole: ProjectMember["role"]
  roles: AssignableProjectRole[]
  busy: boolean
  error: Error | null
  close: () => void
  save: (role: AssignableProjectRole) => void
}) {
  const { t } = useTranslation()
  const initial = roles.find((role) => role === currentRole) ?? roles[0] ?? ""
  const [role, setRole] = useState<AssignableProjectRole | "">(initial)
  const canSubmit = roles.includes(role as AssignableProjectRole) && role !== currentRole && !busy

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (canSubmit) save(role as AssignableProjectRole)
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) close() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("organizations.members.changeRole")}</DialogTitle>
          <DialogDescription>
            {t("organizations.addToProject.changeRoleDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-4 px-6">
            <div className="space-y-1.5">
              <Label htmlFor="access-member-role">{t("organizations.addToProject.role")}</Label>
              <OptionMenu<AssignableProjectRole>
                id="access-member-role"
                label={t("organizations.addToProject.role")}
                value={role}
                options={roles.map((value) => ({
                  value,
                  label: t(`organizations.addToProject.roles.${value}`),
                }))}
                placeholder={t("organizations.members.chooseRole")}
                disabled={busy}
                onChange={setRole}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {t(changeRoleErrorKey(error))}
              </p>
            )}
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

function changeRoleErrorKey(error: Error) {
  if (error instanceof ApiError) {
    if (error.status === 403) return "organizations.errors.forbidden"
    if (error.status === 404) return "organizations.addToProject.unavailable"
    if (error.status === 409) return "organizations.errors.conflict"
  }
  return "organizations.errors.save"
}
