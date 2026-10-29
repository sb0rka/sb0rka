import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@sb0rka/ui"
import { ApiError } from "@/lib/api-client"
import { useInviteOrganizationMember } from "../hooks"
import { organizationInviteRoles, type MemberRole } from "../roles"

interface InviteMemberDialogProps {
  organizationId: string
  callerRole: MemberRole
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InviteMemberDialog({
  organizationId,
  callerRole,
  open,
  onOpenChange,
}: InviteMemberDialogProps) {
  const { t } = useTranslation()
  const invite = useInviteOrganizationMember(organizationId)
  const roles = organizationInviteRoles(callerRole)
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<MemberRole>(roles[roles.length - 1] ?? "viewer")
  const [formError, setFormError] = useState<string | null>(null)

  function reset() {
    setUsername("")
    setEmail("")
    setRole(roles[roles.length - 1] ?? "viewer")
    setFormError(null)
    invite.reset()
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmedUsername = username.trim()
    const trimmedEmail = email.trim()
    if (!trimmedUsername && !trimmedEmail) {
      setFormError(t("organizations.invite.identityRequired"))
      return
    }

    invite.mutate(
      {
        role,
        ...(trimmedUsername ? { username: trimmedUsername } : {}),
        ...(trimmedEmail ? { email: trimmedEmail } : {}),
      },
      {
        onSuccess: () => {
          reset()
          onOpenChange(false)
        },
      },
    )
  }

  const errorMessage =
    formError ??
    (invite.error instanceof ApiError
      ? invite.error.message
      : invite.error
        ? t("organizations.invite.fallbackError")
        : null)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-0 p-0 shadow-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="p-6 text-start">
            <DialogTitle>{t("organizations.invite.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("organizations.invite.dialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-6 pb-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-username">{t("organizations.invite.username")}</Label>
              <Input
                id="invite-username"
                value={username}
                autoComplete="off"
                onChange={(event) => {
                  setUsername(event.target.value)
                  setFormError(null)
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">{t("organizations.invite.email")}</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                autoComplete="off"
                onChange={(event) => {
                  setEmail(event.target.value)
                  setFormError(null)
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-role">{t("organizations.members.role")}</Label>
              <select
                id="invite-role"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                value={role}
                onChange={(event) => setRole(event.target.value as MemberRole)}
              >
                {roles.map((option) => (
                  <option key={option} value={option}>
                    {t(`roles.${option}`)}
                  </option>
                ))}
              </select>
            </div>
            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
          </div>
          <DialogFooter className="min-h-16 items-center pb-6 pt-0 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t("common.actions.cancel")}
            </Button>
            <Button type="submit" disabled={invite.isPending || roles.length === 0}>
              {invite.isPending ? t("common.creating") : t("organizations.invite.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
