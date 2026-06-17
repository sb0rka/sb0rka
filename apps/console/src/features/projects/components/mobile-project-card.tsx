import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Copy, Database } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button, buttonPressClass } from "@/components/ui/button"
import { FloatingHint } from "@/components/ui/floating-hint"
import { useDatabases } from "@/features/projects/hooks"
import type { ProjectResponse } from "@/features/projects/api"
import { cn } from "@/lib/utils"

export function MobileProjectCard({ project }: { project: ProjectResponse }) {
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
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-[-0.2px] text-card-foreground">
            {project.name}
          </h2>
          <button
            type="button"
            onClick={() => void handleCopyProjectId()}
            className={cn(
              "relative mt-2 flex max-w-full items-center gap-1.5 text-xs text-muted-foreground",
              buttonPressClass,
            )}
            aria-label={t("projects.detail.copyProjectId")}
          >
            <Copy className="size-3.5 shrink-0" />
            <span className="truncate">{project.id}</span>
            <FloatingHint message={copyMessage} placement="bottom" align="start" />
          </button>
        </div>
        <Badge
          variant={project.is_active ? "active" : "inactive"}
          className="shrink-0 px-2.5 py-0.5 text-xs font-semibold leading-4"
        >
          {project.is_active ? t("projects.cardOnline") : t("projects.cardOffline")}
        </Badge>
      </div>

      <div className="mt-4 rounded-xl bg-muted/40 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Database className="size-4 text-muted-foreground" />
          {t("tabs.databases")}
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {isLoading ? (
            <p>{t("common.loading")}</p>
          ) : isError ? (
            <p>{t("common.notAvailable")}</p>
          ) : databases.length === 0 ? (
            <p>{t("databases.empty")}</p>
          ) : (
            <ul className="space-y-1">
              {databases.slice(0, 3).map((db) => (
                <li key={db.resource_id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full truncate rounded-md py-1 text-left text-muted-foreground hover:text-foreground",
                      buttonPressClass,
                    )}
                    onClick={() =>
                      navigate(`/projects/${project.id}/databases/${db.resource_id}`)
                    }
                  >
                    {db.name}
                  </button>
                </li>
              ))}
              {databases.length > 3 ? (
                <li className="text-xs text-muted-foreground">
                  +{databases.length - 3}
                </li>
              ) : null}
            </ul>
          )}
        </div>
      </div>

      <Button
        className="mt-4 h-11 w-full rounded-xl"
        onClick={() => navigate(`/projects/${project.id}`)}
      >
        {t("projects.cardConnect")}
      </Button>
    </article>
  )
}
