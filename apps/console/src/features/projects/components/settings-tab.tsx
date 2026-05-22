import { Button } from "@/components/ui/button"
import { useConfirmDialog } from "@/components/confirm-dialog-provider"
import { useToast } from "@/components/toast-provider"
import { useTranslation } from "react-i18next"
import { getResolvedLanguage } from "@/lib/i18n"
import {
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "@/lib/api-client"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useDeactivateProject, useUpdateProject } from "../hooks"

interface ProjectSettingsProps {
  projectId: string
  projectName: string
  projectDescription: string
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

function normalizeDescription(value: string): string {
  return value.trim()
}

export function ProjectSettings({
  projectId,
  projectName,
  projectDescription,
  createdAt,
}: ProjectSettingsProps) {
  const { t } = useTranslation()
  const locale = getResolvedLanguage()
  const confirm = useConfirmDialog()
  const { showSuccess } = useToast()
  const navigate = useNavigate()
  const deactivateProject = useDeactivateProject()
  const updateProject = useUpdateProject()

  const [name, setName] = useState(projectName)
  const [description, setDescription] = useState(projectDescription)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    setName(projectName)
    setDescription(projectDescription)
  }, [projectName, projectDescription])

  useEffect(() => {
    if (!saveSuccess) return
    const id = window.setTimeout(() => setSaveSuccess(false), 4000)
    return () => window.clearTimeout(id)
  }, [saveSuccess])

  const trimmedName = name.trim()
  const trimmedDesc = normalizeDescription(description)
  const baselineDesc = normalizeDescription(projectDescription)
  const hasChanges =
    trimmedName !== projectName.trim() || trimmedDesc !== baselineDesc
  const canSave =
    trimmedName.length > 0 && hasChanges && !updateProject.isPending

  async function handleSave() {
    if (!projectId || !canSave) return

    setSaveError(null)
    setSaveSuccess(false)

    const payload: { name?: string; description?: string } = {}
    if (trimmedName !== projectName.trim()) payload.name = trimmedName
    if (trimmedDesc !== baselineDesc) payload.description = trimmedDesc

    try {
      await updateProject.mutateAsync({ id: projectId, ...payload })
      setSaveSuccess(true)
    } catch (error) {
      setSaveError(getErrorMessage(error, t("projects.settings.saveError")))
    }
  }

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
      showSuccess(t("projects.settings.deleted"))
      navigate("/projects")
    } catch (error) {
      setDeleteError(getErrorMessage(error, t("projects.settings.deleteError")))
    }
  }

  const cardTitleClass =
    "text-xl font-semibold leading-5 tracking-tight text-card-foreground"

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">
        {t("projects.settings.title")}
      </h2>

      <div className="flex flex-col gap-6">

        <Card className="overflow-hidden shadow-sm">
          <CardHeader className="gap-1.5">
            <CardTitle className={cardTitleClass}>
              {t("projects.settings.editSectionTitle")}
            </CardTitle>
            <CardDescription className="text-sm leading-5">
              {t("projects.settings.editSectionDescription")}
            </CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-4 border-b border-border px-6 pb-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-settings-name">{t("common.labels.name")}</Label>
              <Input
                id="project-settings-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="project-settings-description">
                {t("common.labels.description")}
              </Label>
              <Input
                id="project-settings-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <CardFooter className="flex flex-col items-start gap-2 pt-6">
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={!canSave}
            >
              {updateProject.isPending ? t("common.saving") : t("common.actions.saveChanges")}
            </Button>
            {saveSuccess ? (
              <p className="text-sm text-muted-foreground" role="status">
                {t("common.messages.changesSaved")}
              </p>
            ) : null}
            {saveError ? (
              <p className="text-sm text-destructive" role="alert">
                {saveError}
              </p>
            ) : null}
          </CardFooter>
        </Card>

        <Card className="overflow-hidden shadow-sm">
          <CardHeader className="gap-1.5 border-b border-border">
            <CardTitle className={cardTitleClass}>{t("projects.settings.dangerTitle")}</CardTitle>
            <CardDescription className="text-sm leading-5">
              {t("projects.settings.dangerDescription")}
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col items-start gap-2 pt-6">
            <Button
              variant="destructive"
              type="button"
              onClick={() => void handleDeleteProject()}
              disabled={deactivateProject.isPending}
            >
              {deactivateProject.isPending
                ? t("common.deleting")
                : t("projects.settings.deleteButton")}
            </Button>
            {deleteError ? (
              <p className="text-sm text-destructive" role="alert">
                {deleteError}
              </p>
            ) : null}
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}

interface SettingsTabProps {
  projectId: string
  projectName: string
  projectDescription: string
  createdAt?: string
}

export function SettingsTab({
  projectId,
  projectName,
  projectDescription,
  createdAt,
}: SettingsTabProps) {
  return (
    <TabsContent value="settings">
      <ProjectSettings
        projectId={projectId}
        projectName={projectName}
        projectDescription={projectDescription}
        createdAt={createdAt}
      />
    </TabsContent>
  )
}
