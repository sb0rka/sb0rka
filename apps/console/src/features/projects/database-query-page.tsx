import { ArrowLeft } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { ApiError } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { DatabaseQueryPanel } from "./components/database-query-panel"
import { useDatabase } from "./hooks"

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export function DatabaseQueryPage() {
  const { t } = useTranslation()
  const { id = "", resourceId = "" } = useParams<{ id: string; resourceId: string }>()
  const navigate = useNavigate()
  const normalizedResourceId = resourceId.trim()
  const isValidResourceId = normalizedResourceId.length > 0

  const databaseQuery = useDatabase(id, isValidResourceId ? normalizedResourceId : undefined)

  if (!isValidResourceId) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-destructive">{t("databases.invalidId")}</p>
        <div>
          <Button variant="outline" onClick={() => navigate(`/projects/${id}?tab=databases`)}>
            {t("databases.backToList")}
          </Button>
        </div>
      </div>
    )
  }

  if (databaseQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("databases.loading")}</p>
  }

  if (databaseQuery.isError || !databaseQuery.data) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-destructive">
          {getErrorMessage(databaseQuery.error, t("databases.loadError"))}
        </p>
        <div>
          <Button variant="outline" onClick={() => navigate(`/projects/${id}?tab=databases`)}>
            {t("databases.backToList")}
          </Button>
        </div>
      </div>
    )
  }

  const detailHref = `/projects/${id}/databases/${encodeURIComponent(normalizedResourceId)}`

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">{t("databaseQuery.title")}</h1>
          <p className="text-sm text-muted-foreground">{databaseQuery.data.name}</p>
        </div>
        <Button variant="outline" className="gap-2" asChild>
          <Link to={detailHref}>
            <ArrowLeft className="h-4 w-4" />
            {t("databaseQuery.backToDatabase")}
          </Link>
        </Button>
      </div>

      <div className="min-h-0 flex-1 rounded-xl border border-border/70 bg-card p-6">
        <DatabaseQueryPanel
          projectId={id}
          databaseId={normalizedResourceId}
          databaseName={databaseQuery.data.name}
        />
      </div>
    </div>
  )
}
