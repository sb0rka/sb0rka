import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus } from "lucide-react"
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  TabsContent,
  useToast,
} from "@sb0rka/ui"
import { ApiError } from "@/lib/api-client"
import { useAuth } from "@/features/auth/auth-provider"
import { useOrganizationMembers } from "@/features/organizations/hooks"
import { useOrganizations } from "@/features/organizations/hooks"
import {
  assignableProjectRoles,
  canAssignProjectRole,
  isMemberRole,
  memberRoleRank,
  type MemberRole,
} from "@/features/organizations/roles"
import {
  useAddProjectMember,
  useProject,
  useProjectMembers,
  useRemoveProjectMember,
  useUpdateProjectMemberRole,
} from "../hooks"

function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

interface AccessTabProps {
  projectId: string
}

export function AccessTab({ projectId }: AccessTabProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showError, showSuccess } = useToast()
  const [addOpen, setAddOpen] = useState(false)
  const [subjectId, setSubjectId] = useState("")
  const projectQuery = useProject(projectId)
  const membersQuery = useProjectMembers(projectId)
  const organizationsQuery = useOrganizations()
  const addMember = useAddProjectMember(projectId)
  const updateRole = useUpdateProjectMemberRole(projectId)
  const removeMember = useRemoveProjectMember(projectId)
  const members = membersQuery.data?.members ?? []
  const owningOrg = (organizationsQuery.data?.organizations ?? []).find(
    (organization) => organization.id === projectQuery.data?.owner_subject_id,
  )
  const orgMembersQuery = useOrganizationMembers(owningOrg?.id ?? "")
  const caller = members.find((member) => member.subject_id === user?.id)
  const callerRole = caller?.role ?? ""
  const grantableRoles = assignableProjectRoles(callerRole)
  const canManage = callerRole === "owner" || callerRole === "admin"
  const ownerCount = members.filter((member) => member.role === "owner").length
  const [role, setRole] = useState<MemberRole>(grantableRoles[0] ?? "viewer")

  const candidateMembers = useMemo(() => {
    const existing = new Set(members.map((member) => member.subject_id))
    return (orgMembersQuery.data?.members ?? []).filter(
      (member) => !existing.has(member.user_id),
    )
  }, [members, orgMembersQuery.data?.members])

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault()
    const targetId = subjectId.trim()
    if (!targetId || !isMemberRole(role) || !canAssignProjectRole(callerRole, role)) return
    try {
      await addMember.mutateAsync({ subject_id: targetId, role })
      showSuccess(t("projects.access.added"))
      setSubjectId("")
      setAddOpen(false)
    } catch (error) {
      showError(errorText(error, t("projects.access.addError")))
    }
  }

  async function handleRoleChange(subject: string, currentRole: string, nextRole: string) {
    if (nextRole === currentRole || !canAssignProjectRole(callerRole, nextRole)) return
    if (memberRoleRank(currentRole) >= memberRoleRank(callerRole)) return
    if (currentRole === "owner" && ownerCount <= 1) return
    try {
      await updateRole.mutateAsync({ subjectId: subject, role: nextRole })
    } catch (error) {
      showError(errorText(error, t("projects.access.updateError")))
    }
  }

  async function handleRemove(subject: string) {
    try {
      await removeMember.mutateAsync(subject)
      showSuccess(t("projects.access.removed"))
    } catch (error) {
      showError(errorText(error, t("projects.access.removeError")))
    }
  }

  return (
    <TabsContent value="access">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("projects.access.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {owningOrg
                ? t("projects.access.ownedByOrg", { name: owningOrg.name })
                : t("projects.access.description")}
            </p>
          </div>
          {canManage && grantableRoles.length > 0 ? (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {owningOrg
                ? t("projects.access.addFromOrg", { name: owningOrg.name })
                : t("projects.access.addMember")}
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
                  <th className="px-4 py-3 font-medium">{t("projects.access.member")}</th>
                  <th className="px-4 py-3 font-medium">{t("projects.access.orgMembership")}</th>
                  <th className="px-4 py-3 font-medium">{t("projects.access.role")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("organizations.members.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const isSelf = member.subject_id === user?.id
                  const isLastOwner = member.role === "owner" && ownerCount <= 1
                  const canEditRole =
                    canManage &&
                    !isLastOwner &&
                    memberRoleRank(member.role) < memberRoleRank(callerRole)
                  const canRemove =
                    canManage &&
                    !isSelf &&
                    !isLastOwner &&
                    (member.role !== "owner" || callerRole === "owner")
                  const orgMember = (orgMembersQuery.data?.members ?? []).find(
                    (item) => item.user_id === member.subject_id,
                  )
                  const roleChoices = canEditRole
                    ? grantableRoles.filter(
                        (option) => option === member.role || canAssignProjectRole(callerRole, option),
                      )
                    : []
                  return (
                    <tr key={member.subject_id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">
                          {isSelf
                            ? t("projects.access.you", { name: user?.username ?? "" })
                            : member.subject_id}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">{member.subject_id}</p>
                      </td>
                      <td className="px-4 py-3">
                        {owningOrg && orgMember ? (
                          <Badge>
                            {owningOrg.name} · {isMemberRole(orgMember.role) ? t(`roles.${orgMember.role}`) : orgMember.role}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">{t("projects.personal")}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {canEditRole ? (
                          <select
                            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                            value={member.role}
                            disabled={updateRole.isPending}
                            aria-label={t("projects.access.role")}
                            onChange={(event) =>
                              void handleRoleChange(member.subject_id, member.role, event.target.value)
                            }
                          >
                            {roleChoices.map((option) => (
                              <option key={option} value={option}>
                                {t(`roles.${option}`)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <Badge>
                              {isMemberRole(member.role) ? t(`roles.${member.role}`) : member.role}
                            </Badge>
                            {isLastOwner ? (
                              <span className="text-xs text-muted-foreground">
                                {t("organizations.members.lastOwner")}
                              </span>
                            ) : null}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canRemove ? (
                          <Button
                            variant="outline"
                            disabled={removeMember.isPending}
                            onClick={() => void handleRemove(member.subject_id)}
                          >
                            {t("organizations.members.remove")}
                          </Button>
                        ) : isLastOwner ? (
                          <span className="text-xs text-muted-foreground">
                            {t("projects.access.billedSubject")}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-sm text-muted-foreground">{t("projects.access.rankHint")}</p>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <form onSubmit={(event) => void handleAdd(event)}>
              <DialogHeader>
                <DialogTitle>{t("projects.access.addMember")}</DialogTitle>
                <DialogDescription>
                  {owningOrg
                    ? t("projects.access.addFromOrg", { name: owningOrg.name })
                    : t("projects.access.subjectHint")}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-4">
                {owningOrg && candidateMembers.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="project-member-subject">{t("projects.access.member")}</Label>
                    <select
                      id="project-member-subject"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                      value={subjectId}
                      onChange={(event) => setSubjectId(event.target.value)}
                    >
                      <option value="">{t("projects.access.chooseMember")}</option>
                      {candidateMembers.map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.user_id}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="project-member-subject">{t("projects.access.subjectId")}</Label>
                    <Input
                      id="project-member-subject"
                      value={subjectId}
                      onChange={(event) => setSubjectId(event.target.value)}
                      autoComplete="off"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="project-member-role">{t("projects.access.role")}</Label>
                  <select
                    id="project-member-role"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={role}
                    onChange={(event) => setRole(event.target.value as MemberRole)}
                  >
                    {grantableRoles.map((option) => (
                      <option key={option} value={option}>
                        {t(`roles.${option}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                  {t("common.actions.cancel")}
                </Button>
                <Button type="submit" disabled={!subjectId.trim() || addMember.isPending}>
                  {addMember.isPending ? t("common.creating") : t("common.actions.add")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </TabsContent>
  )
}
