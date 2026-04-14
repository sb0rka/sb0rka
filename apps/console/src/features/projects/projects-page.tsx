import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useProjects } from "./hooks"
import { CreateProjectDialog } from "./create-project-dialog"

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
            <Card key={project.id} className="transition-colors hover:border-primary/40">
              <CardHeader>
                <CardTitle className="text-lg">{project.name}</CardTitle>
                {project.description && (
                  <CardDescription>{project.description}</CardDescription>
                )}
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
