import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Plus, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useProjects, useDatabases } from "./hooks"
import type { ProjectResponse } from "./api"
import { CreateProjectDialog } from "./create-project-dialog"

function copyProjectId(id: string) {
  navigator.clipboard.writeText(id)
}

function ProjectCard({ project }: { project: ProjectResponse }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data } = useDatabases(project.id)
  const dbCount = data?.databases.length ?? 0

  return (
    <Card>
      <CardHeader className="gap-1.5 pb-4">
        <div className="flex items-center gap-3">
          <CardTitle className="flex-1 truncate text-xl -tracking-wide">
            {project.name}
          </CardTitle>
          <Badge variant={project.is_active ? "active" : "inactive"}>
            {project.is_active ? t("projects.active") : t("projects.inactive")}
          </Badge>
        </div>
        <CardDescription>{t("projects.dbCount", { count: dbCount })}</CardDescription>
      </CardHeader>
      <CardFooter className="flex-row items-center gap-6">
        <button
          type="button"
          onClick={() => copyProjectId(project.id)}
          className="flex flex-1 items-center gap-2 min-w-0"
        >
          <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm text-muted-foreground">
            {project.id}
          </span>
        </button>
        <Button onClick={() => navigate(`/projects/${project.id}`)}>
          {t("common.actions.open")}
        </Button>
      </CardFooter>
    </Card>
  )
}

export function ProjectsPage() {
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const { data, isLoading } = useProjects()
  const projects = data?.projects ?? []

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
