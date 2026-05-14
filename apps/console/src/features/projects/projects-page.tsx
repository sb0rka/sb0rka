import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Plus, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AlphaToast } from "@/components/ui/alpha-toast"
import { FloatingHint } from "@/components/ui/floating-hint"
import { Card, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useProjects, useDatabases } from "./hooks"
import type { ProjectResponse } from "./api"
import { CreateProjectDialog } from "./create-project-dialog"

const ALPHA_UNDERSTOOD_KEY = "alpha-understood"

function ProjectCard({ project }: { project: ProjectResponse }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const { data, isLoading, isError } = useDatabases(project.id)
  const databases = data?.databases ?? []

  async function handleCopyProjectId() {
    try {
      await navigator.clipboard.writeText(project.id)
      setCopyMessage(t("projects.detail.idCopied"))
      window.setTimeout(() => setCopyMessage(null), 2000)
    } catch {
      setCopyMessage(t("common.messages.copyFailed"))
      window.setTimeout(() => setCopyMessage(null), 3000)
    }
  }

  return (
    <Card className="flex h-full flex-col shadow-sm">
      <CardHeader className="flex flex-1 flex-col gap-3 px-6 pb-4 pt-6">
        <div className="flex w-full items-center gap-3">
          <CardTitle className="min-w-0 flex-1 truncate text-xl font-semibold leading-normal tracking-[-0.3px]">
            {project.name}
          </CardTitle>
          <Badge
            variant={project.is_active ? "active" : "inactive"}
            className="shrink-0 px-2.5 py-0.5 text-xs font-semibold leading-4"
          >
            {project.is_active ? t("projects.cardOnline") : t("projects.cardOffline")}
          </Badge>
        </div>
        <div className="text-sm leading-5 text-muted-foreground">
          {isLoading ? (
            <p className="leading-5">{t("common.loading")}</p>
          ) : isError ? (
            <p className="leading-5">{t("common.notAvailable")}</p>
          ) : databases.length === 0 ? (
            <p className="leading-5">{t("databases.empty")}</p>
          ) : (
            <ul className="max-h-32 space-y-0 overflow-y-auto">
              {databases.map((db) => (
                <li key={db.resource_id}>
                  <button
                    type="button"
                    className="w-full truncate rounded-md py-0 text-left font-normal leading-5 text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() =>
                      navigate(`/projects/${project.id}/databases/${db.resource_id}`)
                    }
                  >
                    {db.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardHeader>
      <CardFooter className="mt-auto flex flex-row flex-wrap items-center gap-6 px-6 pb-6 pt-0">
        <div className="relative min-w-0 flex-1 basis-[min-content]">
          <button
            type="button"
            onClick={() => void handleCopyProjectId()}
            className="flex w-full min-w-0 items-center gap-2"
            aria-label={t("projects.detail.copyProjectId")}
          >
            <Copy className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-left text-sm leading-5 text-muted-foreground">
              {project.id}
            </span>
          </button>
          <FloatingHint message={copyMessage} placement="bottom" align="start" />
        </div>
        <Button className="shrink-0" onClick={() => navigate(`/projects/${project.id}`)}>
          {t("projects.cardConnect")}
        </Button>
      </CardFooter>
    </Card>
  )
}

export function ProjectsPage() {
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const [alphaToastOpen, setAlphaToastOpen] = useState(false)
  const { data, isLoading } = useProjects()
  const projects = data?.projects ?? []

  useEffect(() => {
    try {
      setAlphaToastOpen(!localStorage.getItem(ALPHA_UNDERSTOOD_KEY))
    } catch {
      setAlphaToastOpen(true)
    }
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">{t("projects.title")}</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("projects.create")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center min-h-[500px]">
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-border shadow-sm min-h-[500px]">
          <div className="flex flex-col items-center gap-1">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {t("projects.emptyTitle")}
            </h2>
            <p className="text-sm tracking-tight text-muted-foreground">
              {t("projects.emptyDescription")}
            </p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("projects.create")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>*]:h-full">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />

      {alphaToastOpen ? (
        <div
          className="fixed bottom-[10px] right-[10px] z-50  max-w-sm"
          aria-live="polite"
        >
          <AlphaToast
            className="w-full"
            title={t("app.alphaToastTitle")}
            description={t("app.alphaToastDescription")}
            actionLabel={t("app.alphaToastAction")}
            onAction={() => {
              try {
                localStorage.setItem(ALPHA_UNDERSTOOD_KEY, "1")
              } catch {
                /* ignore quota / private mode */
              }
              setAlphaToastOpen(false)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
