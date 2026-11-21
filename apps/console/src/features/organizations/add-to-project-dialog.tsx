import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  useToast,
} from "@sb0rka/ui"
import { assignableProjectRoles, type AssignableProjectRole } from "@/features/projects/api"
import { useAddProjectMember } from "@/features/projects/hooks"
import { ApiError } from "@/lib/api-client"
import { OptionMenu } from "./components"

export function AddToProjectDialog({
  memberId,
  memberName,
  project,
  canAssignAdmin,
  canAdd,
  close,
}: {
  memberId: string
  memberName: string
  project: { public_id: string; name: string }
  canAssignAdmin: boolean
  canAdd: boolean
  close: () => void
}) {
  const { t } = useTranslation()
  const { showSuccess } = useToast()
  const [role, setRole] = useState<AssignableProjectRole>("viewer")
  const add = useAddProjectMember(memberId)
  const roles = assignableProjectRoles.filter((value) => value !== "admin" || canAssignAdmin)
  const canSubmit = canAdd && roles.includes(role) && !add.isPending

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    add.mutate({ projectId: project.public_id, role }, {
      onSuccess: () => {
        showSuccess(t("organizations.addToProject.success"))
        close()
      },
    })
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !add.isPending) close() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("organizations.addToProject.title")}</DialogTitle>
          <DialogDescription>{t("organizations.addToProject.description", { name: memberName, project: project.name })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-4 px-6">
            <div className="space-y-1.5">
              <Label htmlFor="member-project-role">{t("organizations.addToProject.role")}</Label>
              <OptionMenu<AssignableProjectRole>
                id="member-project-role"
                label={t("organizations.addToProject.role")}
                value={role}
                options={roles.map((value) => ({
                  value,
                  label: t(`organizations.addToProject.roles.${value}`),
                }))}
                placeholder={t("organizations.members.chooseRole")}
                disabled={!canAdd || add.isPending}
                onChange={setRole}
              />
            </div>
            {add.isError && (
              <p className="text-sm text-destructive" role="alert">{t(addMemberErrorKey(add.error))}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={add.isPending} onClick={close}>
              {t("common.actions.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit} aria-busy={add.isPending}>
              {t(add.isPending ? "common.saving" : "common.actions.add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function addMemberErrorKey(error: Error) {
  if (error instanceof ApiError) {
    if (error.status === 409) return "organizations.addToProject.alreadyMember"
    if (error.status === 403) return "organizations.errors.forbidden"
    if (error.status === 404) return "organizations.addToProject.unavailable"
  }
  return "organizations.errors.save"
}
