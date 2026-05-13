import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const createProject = useCreateProject()

  function reset() {
    setName("")
    setDescription("")
    createProject.reset()
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    createProject.mutate(
      { name: name.trim(), description: description.trim() },
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
      <DialogContent className="max-w-[330px] gap-0 p-0 shadow-sm">
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
              disabled={!name.trim() || createProject.isPending}
            >
              {createProject.isPending ? t("common.creating") : t("projects.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
