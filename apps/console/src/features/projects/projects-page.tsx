import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ProjectsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Проекты</h1>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Создать проект
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-border shadow-sm min-h-[500px]">
        <div className="flex flex-col items-center gap-1">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            У вас нет проектов.
          </h2>
          <p className="text-sm tracking-tight text-muted-foreground">
            Добавьте проект всего за несколько простых шагов.
          </p>
        </div>
      </div>
    </div>
  )
}
