import { Button } from "@/components/ui/button"
import { useConfirmDialog } from "@/components/confirm-dialog-provider"
import { useTranslation } from "react-i18next"
import { getResolvedLanguage } from "@/lib/i18n"
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

function formatCreatedAt(value: string | undefined, locale: string): string {
  if (!value) return "—"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  return new Intl.DateTimeFormat(locale, {
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
  const { t } = useTranslation()
  const locale = getResolvedLanguage()
  const confirm = useConfirmDialog()
  const navigate = useNavigate()
  const deactivateProject = useDeactivateProject()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDeleteProject() {
    if (!projectId || deactivateProject.isPending) return

    const confirmed = await confirm({
      title: t("projects.settings.deleteTitle"),
      description: t("projects.settings.deleteDescription"),
      confirmText: t("common.actions.delete"),
      cancelText: t("common.actions.cancel"),
      confirmVariant: "destructive",
    })
    if (!confirmed) return

    setDeleteError(null)
    try {
      await deactivateProject.mutateAsync(projectId)
      window.alert(t("projects.settings.deleted"))
      navigate("/projects")
    } catch (error) {
      setDeleteError(getErrorMessage(error, t("projects.settings.deleteError")))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold tracking-tight">{t("projects.settings.title")}</h2>

      <Card className="overflow-hidden shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-xl font-semibold tracking-tight">
              {projectName}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("projects.settings.createdAt", { date: formatCreatedAt(createdAt, locale) })}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden shadow-sm">
        <CardHeader className="gap-1 border-b border-border p-6">
          <CardTitle className="text-xl font-semibold tracking-tight">
            {t("projects.settings.dangerTitle")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("projects.settings.dangerDescription")}
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
              {deactivateProject.isPending ? t("common.deleting") : t("projects.settings.deleteButton")}
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
