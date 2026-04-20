import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs"
import { ApiError } from "@/lib/api-client"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useDeactivateProject } from "../hooks"

interface ProjectSettingsProps {
  projectId: string
  projectName: string
  createdAt?: string
}

function formatCreatedAt(value?: string): string {
  if (!value) return "—"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date)
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export function ProjectSettings({
  projectId,
  projectName,
  createdAt,
}: ProjectSettingsProps) {
  const navigate = useNavigate()
  const deactivateProject = useDeactivateProject()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDeleteProject() {
    if (!projectId || deactivateProject.isPending) return

    const confirmed = window.confirm("Удалить проект и все связанные с ним данные?")
    if (!confirmed) return

    setDeleteError(null)
    try {
      await deactivateProject.mutateAsync(projectId)
      window.alert("Проект удален")
      navigate("/projects")
    } catch (error) {
      setDeleteError(getErrorMessage(error, "Не удалось удалить проект. Попробуйте снова."))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold tracking-tight">Настройки</h2>

      <Card className="overflow-hidden shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-xl font-semibold tracking-tight">
              {projectName}
            </h3>
            <p className="text-sm text-muted-foreground">
              Дата создания: {formatCreatedAt(createdAt)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="gap-1 border-b border-border p-6">
          <CardTitle className="text-xl font-semibold tracking-tight">
            Опасная зона
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Безвозвратно удалить проект и все связанные с ним данные.
          </p>
        </CardHeader>
        <CardFooter className="p-6">
          <div className="flex flex-col gap-2">
            <Button
              className="self-start"
              variant="destructive"
              onClick={() => void handleDeleteProject()}
              disabled={deactivateProject.isPending}
            >
              {deactivateProject.isPending ? "Удаление…" : "Удалить проект"}
            </Button>
            {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}

interface SettingsTabProps {
  projectId: string
  projectName: string
  createdAt?: string
}

export function SettingsTab({ projectId, projectName, createdAt }: SettingsTabProps) {
  return (
    <TabsContent value="settings">
      <ProjectSettings projectId={projectId} projectName={projectName} createdAt={createdAt} />
    </TabsContent>
  )
}
