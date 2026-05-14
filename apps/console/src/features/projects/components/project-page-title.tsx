import { useCallback, useState } from "react"
import { Copy } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { ProjectResponse } from "../api"

interface ProjectPageTitleProps {
  project: ProjectResponse
}

export function ProjectPageTitle({ project }: ProjectPageTitleProps) {
  const { t } = useTranslation()
  const [copyFailed, setCopyFailed] = useState(false)

  const copyId = useCallback(async () => {
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(project.id)
    } catch {
      setCopyFailed(true)
    }
  }, [project.id])

  const description = project.description?.trim() ?? ""

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-semibold leading-none tracking-tight text-foreground">
              {project.name}
            </h1>
            <div className="flex max-w-full items-center gap-1">
              <span className="truncate text-xs leading-5 text-muted-foreground">
                {project.id}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground"
                onClick={copyId}
                aria-label={t("projects.detail.copyProjectId")}
              >
                <Copy className="size-3" />
              </Button>
            </div>
          </div>
          {description ? (
            <p className="max-w-[650px] text-sm leading-5 text-muted-foreground">{description}</p>
          ) : null}
          {copyFailed ? (
            <p className="text-xs text-destructive" role="status">
              {t("common.messages.copyFailed")}
            </p>
          ) : null}
        </div>
        <Badge
          variant={project.is_active ? "active" : "inactive"}
          className="shrink-0 px-2.5 py-0.5"
        >
          {project.is_active ? t("projects.active") : t("projects.inactive")}
        </Badge>
      </div>
    </div>
  )
}
