import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs"

interface ProjectSettingsProps {
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

export function ProjectSettings({ projectName, createdAt }: ProjectSettingsProps) {
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
            Перманентно удалить проект и все связанные с ним данные.
          </p>
        </CardHeader>
        <CardFooter className="p-6">
          <Button variant="destructive">Удалить проект</Button>
        </CardFooter>
      </Card>
    </div>
  )
}

interface SettingsTabProps {
  projectName: string
  createdAt?: string
}

export function SettingsTab({ projectName, createdAt }: SettingsTabProps) {
  return (
    <TabsContent value="settings">
      <ProjectSettings projectName={projectName} createdAt={createdAt} />
    </TabsContent>
  )
}
