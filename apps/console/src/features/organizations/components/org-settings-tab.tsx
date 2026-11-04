import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  useToast,
} from "@sb0rka/ui"
import { ApiError } from "@/lib/api-client"
import { useConfirmDialog } from "@/components/confirm-dialog-provider"
import { useAuth } from "@/features/auth/auth-provider"
import {
  useDeleteOrganization,
  useOrganizationMembers,
  useRemoveOrganizationMember,
  useUpdateOrganization,
} from "../hooks"
import { countOwners } from "../membership"
import { canEditOrganization, type MemberRole } from "../roles"

function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

interface OrgSettingsTabProps {
  organizationId: string
  name: string
  description: string
  callerRole: MemberRole | undefined
}

export function OrgSettingsTab({
  organizationId,
  name,
  description,
  callerRole,
}: OrgSettingsTabProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const confirm = useConfirmDialog()
  const { showSuccess, showError } = useToast()
  const updateOrganization = useUpdateOrganization(organizationId)
  const deleteOrganization = useDeleteOrganization()
  const removeMember = useRemoveOrganizationMember(organizationId)
  const membersQuery = useOrganizationMembers(organizationId)
  const [nextName, setNextName] = useState(name)
  const [nextDescription, setNextDescription] = useState(description)
  const canEdit = canEditOrganization(callerRole)
  const ownerCount = countOwners(membersQuery.data?.members)
  const isLastOwner = callerRole === "owner" && ownerCount <= 1
  const canLeave = !!user && callerRole !== undefined && !isLastOwner

  useEffect(() => {
    setNextName(name)
    setNextDescription(description)
  }, [name, description])

  const trimmedName = nextName.trim()
  const trimmedDescription = nextDescription.trim()
  const hasChanges = trimmedName !== name.trim() || trimmedDescription !== description.trim()

  async function handleSave() {
    if (!canEdit || !trimmedName || !hasChanges) return
    const payload: { name?: string; description?: string } = {}
    if (trimmedName !== name.trim()) payload.name = trimmedName
    if (trimmedDescription !== description.trim()) payload.description = trimmedDescription
    try {
      await updateOrganization.mutateAsync(payload)
      showSuccess(t("common.messages.changesSaved"))
    } catch (error) {
      showError(errorText(error, t("organizations.settings.saveError")))
    }
  }

  async function handleLeave() {
    if (!user || !canLeave) return
    const confirmed = await confirm({
      title: t("organizations.settings.leaveTitle"),
      description: t("organizations.settings.leaveDescription"),
      confirmText: t("organizations.settings.leave"),
      cancelText: t("common.actions.cancel"),
    })
    if (!confirmed) return
    try {
      await removeMember.mutateAsync(user.id)
      showSuccess(t("organizations.settings.left"))
      navigate("/organizations")
    } catch (error) {
      showError(errorText(error, t("organizations.settings.leaveError")))
    }
  }

  async function handleDelete() {
    if (callerRole !== "owner" || deleteOrganization.isPending) return
    const confirmed = await confirm({
      title: t("organizations.settings.deleteTitle"),
      description: t("organizations.settings.deleteDescription"),
      confirmText: t("common.actions.delete"),
      cancelText: t("common.actions.cancel"),
      confirmVariant: "destructive",
    })
    if (!confirmed) return
    try {
      await deleteOrganization.mutateAsync(organizationId)
      showSuccess(t("organizations.settings.deleted"))
      navigate("/organizations")
    } catch (error) {
      showError(errorText(error, t("organizations.settings.deleteError")))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="gap-1.5">
          <CardTitle className="text-xl font-semibold tracking-tight">
            {t("organizations.settings.generalTitle")}
          </CardTitle>
          <CardDescription>{t("organizations.settings.generalDescription")}</CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-4 border-b border-border px-6 pb-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="organization-settings-name">{t("common.labels.name")}</Label>
            <Input
              id="organization-settings-name"
              value={nextName}
              disabled={!canEdit}
              onChange={(event) => setNextName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="organization-settings-description">
              {t("common.labels.description")}
            </Label>
            <Input
              id="organization-settings-description"
              value={nextDescription}
              disabled={!canEdit}
              onChange={(event) => setNextDescription(event.target.value)}
            />
          </div>
        </div>
        <CardFooter className="pt-6">
          <Button
            type="button"
            disabled={!canEdit || !trimmedName || !hasChanges || updateOrganization.isPending}
            onClick={() => void handleSave()}
          >
            {updateOrganization.isPending ? t("common.saving") : t("common.actions.saveChanges")}
          </Button>
        </CardFooter>
      </Card>

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="gap-1.5 border-b border-border">
          <CardTitle className="text-xl font-semibold tracking-tight">
            {t("organizations.settings.dangerTitle")}
          </CardTitle>
          <CardDescription>{t("organizations.settings.dangerDescription")}</CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col items-start gap-3 pt-6">
          <Button
            type="button"
            variant="outline"
            disabled={!canLeave || removeMember.isPending}
            onClick={() => void handleLeave()}
          >
            {t("organizations.settings.leave")}
          </Button>
          {isLastOwner ? (
            <p className="text-sm text-muted-foreground">{t("organizations.members.lastOwner")}</p>
          ) : null}
          {callerRole === "owner" ? (
            <Button
              type="button"
              variant="delete"
              disabled={deleteOrganization.isPending}
              onClick={() => void handleDelete()}
            >
              {deleteOrganization.isPending
                ? t("common.deleting")
                : t("organizations.settings.delete")}
            </Button>
          ) : null}
        </CardFooter>
      </Card>
    </div>
  )
}
