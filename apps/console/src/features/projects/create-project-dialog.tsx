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
  Textarea,
} from "@sb0rka/ui"
import { useAuth } from "@/features/auth/auth-provider"
import { OptionMenu } from "@/features/organizations/components"
import { useOrganizationMemberships, useOrganizations } from "@/features/organizations/hooks"
import { useCreateProject } from "./hooks"
import { ApiError } from "@/lib/api-client"

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateProjectDialog({
  open,
  onOpenChange,
}: CreateProjectDialogProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [ownerId, setOwnerId] = useState("")
  const organizationList = useOrganizations(open)
  const organizations = open ? organizationList.data?.organizations ?? [] : []
  const memberships = useOrganizationMemberships(
    organizations.map((org) => org.id),
    user?.id ?? "",
  )
  const createProject = useCreateProject()
  const ownerOptions = [
    { value: "", label: t("projects.createDialog.personal"), disabled: false },
    ...organizations.map((org, index) => {
      const membership = memberships[index]
      const role = membership.isSuccess ? membership.data.role : undefined
      const roleLabel = role
        ? t(`organizations.roles.${role}`)
        : t(membership.isError ? "common.notAvailable" : "common.loading")
      return {
        value: org.id,
        label: `${org.name} (${roleLabel})`,
        disabled: organizationList.isError || role !== "owner",
      }
    }),
  ]
  const canSubmit =
    Boolean(name.trim()) &&
    !createProject.isPending &&
    ownerOptions.some((option) => option.value === ownerId && !option.disabled)

  function reset() {
    setName("")
    setDescription("")
    setOwnerId("")
    createProject.reset()
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    createProject.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        owner_subject_id: ownerId || undefined,
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
    createProject.error instanceof ApiError
      ? createProject.error.message
      : createProject.error
        ? t("projects.createDialog.fallbackError")
        : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-0 p-0 shadow-sm">
        <form autoComplete="off" onSubmit={handleSubmit}>
          <DialogHeader className="p-6 text-start">
            <DialogTitle className="leading-6">
              {t("projects.createDialog.title")}
            </DialogTitle>
            <DialogDescription className="leading-5">
              {t("projects.createDialog.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 px-6 pb-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-owner">{t("projects.createDialog.owner")}</Label>
              <OptionMenu
                id="project-owner"
                label={t("projects.createDialog.owner")}
                value={ownerId}
                onChange={setOwnerId}
                options={ownerOptions}
                placeholder={t("projects.createDialog.chooseOwner")}
                disabled={createProject.isPending}
              />
              {organizationList.isError ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {t("projects.createDialog.organizationsLoadError")}
                </p>
              ) : organizationList.isLoading || organizations.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t(organizationList.isLoading ? "common.loading" : "projects.createDialog.ownerHint")}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="project-name"
                className="text-sm font-medium leading-5 text-foreground"
              >
                {t("common.labels.name")}
              </Label>
              <Input
                id="project-name"
                name="sb0rka-project-name"
                autoComplete="off"
                placeholder={t("projects.createDialog.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="project-description"
                className="text-sm font-medium leading-5 text-foreground"
              >
                {t("common.labels.description")}
              </Label>
              <Textarea
                id="project-description"
                name="sb0rka-project-description"
                autoComplete="off"
                placeholder={t("projects.createDialog.descriptionPlaceholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {errorMessage && (
              <p className="text-sm leading-5 text-destructive">{errorMessage}</p>
            )}
          </div>

          <DialogFooter className="min-h-16 items-center pb-6 pt-0 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createProject.isPending}
            >
              {t("common.actions.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
            >
              {createProject.isPending ? t("common.creating") : t("projects.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
