import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQueries } from "@tanstack/react-query"
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
import { ApiError } from "@/lib/api-client"
import { useAuth } from "@/features/auth/auth-provider"
import { listOrganizationMembers } from "@/features/organizations/api"
import { useOrganizations } from "@/features/organizations/hooks"
import { callerOrganizationRole } from "@/features/organizations/membership"
import { useCreateProject } from "./hooks"

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultOwnerSubjectId?: string
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  defaultOwnerSubjectId,
}: CreateProjectDialogProps) {
  const { t } = useTranslation()
  const { user, isAuthenticated } = useAuth()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [ownerSubjectId, setOwnerSubjectId] = useState("")
  const createProject = useCreateProject()
  const organizationsQuery = useOrganizations()
  const organizations = organizationsQuery.data?.organizations ?? []
  const memberQueries = useQueries({
    queries: organizations.map((organization) => ({
      queryKey: ["organizations", organization.id, "members"],
      queryFn: () => listOrganizationMembers(organization.id),
      enabled: open && isAuthenticated,
    })),
  })

  function reset() {
    setName("")
    setDescription("")
    setOwnerSubjectId("")
    createProject.reset()
  }

  useEffect(() => {
    if (!open) return
    setOwnerSubjectId(defaultOwnerSubjectId ?? "")
  }, [open, defaultOwnerSubjectId])

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function ownership(index: number): "owner" | "other" | "unknown" {
    const query = memberQueries[index]
    const members = query?.data?.members
    const role = callerOrganizationRole(members, user?.id)
    if (role === "owner") return "owner"
    if (role) return "other"
    if (!query || query.isPending || query.isFetching) return "unknown"
    return "other"
  }

  const selectedIndex = organizations.findIndex((organization) => organization.id === ownerSubjectId)
  const selectedState = ownerSubjectId ? ownership(selectedIndex) : "personal"
  const ownerBlocked = Boolean(ownerSubjectId) && selectedState !== "owner"

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim() || ownerBlocked) return

    createProject.mutate(
      {
        name: name.trim(),
        description: description.trim(),
        ...(ownerSubjectId ? { owner_subject_id: ownerSubjectId } : {}),
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

  const selectedOrg = organizations.find((organization) => organization.id === ownerSubjectId)

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
            {organizations.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="project-owner">{t("projects.createDialog.owner")}</Label>
                <select
                  id="project-owner"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                  value={ownerSubjectId}
                  onChange={(event) => setOwnerSubjectId(event.target.value)}
                >
                  <option value="">{t("projects.personal")}</option>
                  {organizations.map((organization, index) => {
                    const state = ownership(index)
                    return (
                      <option key={organization.id} value={organization.id} disabled={state !== "owner"}>
                        {organization.name}
                        {state === "other" ? ` — ${t("projects.createDialog.onlyOrgOwner")}` : ""}
                      </option>
                    )
                  })}
                </select>
              </div>
            ) : null}
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
                onChange={(event) => setName(event.target.value)}
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
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
              />
            </div>
            {organizations.length > 0 ? (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm leading-5 text-muted-foreground">
                {selectedOrg
                  ? t("projects.createDialog.billingOrg", { name: selectedOrg.name })
                  : t("projects.createDialog.billingPersonal")}
              </p>
            ) : null}

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
              disabled={!name.trim() || createProject.isPending || ownerBlocked}
            >
              {createProject.isPending ? t("common.creating") : t("projects.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
