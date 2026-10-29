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
import { ApiError } from "@/lib/api-client"
import { useCreateOrganization } from "./hooks"

interface CreateOrganizationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateOrganizationDialog({
  open,
  onOpenChange,
}: CreateOrganizationDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const createOrganization = useCreateOrganization()

  function reset() {
    setName("")
    setDescription("")
    createOrganization.reset()
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return

    createOrganization.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
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
    createOrganization.error instanceof ApiError
      ? createOrganization.error.message
      : createOrganization.error
        ? t("organizations.createDialog.fallbackError")
        : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-0 p-0 shadow-sm">
        <form autoComplete="off" onSubmit={handleSubmit}>
          <DialogHeader className="p-6 text-start">
            <DialogTitle className="leading-6">
              {t("organizations.createDialog.title")}
            </DialogTitle>
            <DialogDescription className="leading-5">
              {t("organizations.createDialog.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 px-6 pb-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="organization-name">{t("common.labels.name")}</Label>
              <Input
                id="organization-name"
                name="sb0rka-organization-name"
                autoComplete="off"
                placeholder={t("organizations.createDialog.namePlaceholder")}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="organization-description">{t("common.labels.description")}</Label>
              <Textarea
                id="organization-description"
                name="sb0rka-organization-description"
                autoComplete="off"
                placeholder={t("organizations.createDialog.descriptionPlaceholder")}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
              />
            </div>
            {errorMessage ? (
              <p className="text-sm leading-5 text-destructive">{errorMessage}</p>
            ) : null}
          </div>

          <DialogFooter className="min-h-16 items-center pb-6 pt-0 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createOrganization.isPending}
            >
              {t("common.actions.cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim() || createOrganization.isPending}>
              {createOrganization.isPending
                ? t("common.creating")
                : t("organizations.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
