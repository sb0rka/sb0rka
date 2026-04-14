import { useState } from "react"
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
        ? "Не удалось создать проект"
        : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Создать проект</DialogTitle>
            <DialogDescription>
              Разверните ваш новый проект одним кликом.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 px-6 pb-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-name">Название</Label>
              <Input
                id="project-name"
                placeholder="Введите название проекта"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-description">Описание</Label>
              <Input
                id="project-description"
                placeholder="Введите описание проекта"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createProject.isPending}
            >
              Отменить
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || createProject.isPending}
            >
              {createProject.isPending ? "Создание…" : "Создать проект"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
