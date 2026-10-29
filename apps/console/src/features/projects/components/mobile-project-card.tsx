import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Building2, Copy, User } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  Badge,
  Button,
  buttonPressClass,
  cn,
  FloatingHint,
} from "@sb0rka/ui"
import type { ProjectResponse } from "@/features/projects/api"

export function MobileProjectCard({
  project,
  owner,
}: {
  project: ProjectResponse
  owner?: { name: string; personal: boolean } | null
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [copyMessage, setCopyMessage] = useState<string | null>(null)

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
          {owner ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              {owner.personal ? <User className="size-3.5 shrink-0" /> : <Building2 className="size-3.5 shrink-0" />}
              <span className="truncate">{owner.personal ? t("projects.personal") : owner.name}</span>
            </p>
          ) : null}
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

      <Button
        className="mt-4 h-11 w-full rounded-xl"
        onClick={() => navigate(`/projects/${project.id}`)}
      >
        {t("projects.cardConnect")}
      </Button>
    </article>
  )
}
