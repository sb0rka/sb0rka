import { useState } from "react"
import { useNavigate } from "react-router-dom"
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

function dbCountLabel(count: number): string {
  if (count === 0) return "0 баз данных"
  if (count === 1) return "1 база данных"
  if (count >= 2 && count <= 4) return `${count} базы данных`
  return `${count} баз данных`
}

function ProjectCard({ project }: { project: ProjectResponse }) {
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
            {project.is_active ? "Активен" : "Неактивен"}
          </Badge>
        </div>
        <CardDescription>{dbCountLabel(dbCount)}</CardDescription>
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
          Открыть
        </Button>
      </CardFooter>
    </Card>
  )
}

export function ProjectsPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const { data, isLoading } = useProjects()
  const projects = data?.projects ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Проекты</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Создать проект
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center min-h-[500px]">
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-border shadow-sm min-h-[500px]">
          <div className="flex flex-col items-center gap-1">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              У вас нет проектов.
            </h2>
            <p className="text-sm tracking-tight text-muted-foreground">
              Добавьте проект всего за несколько простых шагов.
            </p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Создать проект
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
