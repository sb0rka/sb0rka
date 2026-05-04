import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ApiError } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useRunDatabaseQuery } from "../hooks"
import type { RunDatabaseQueryResponse } from "../api"
import { DatabaseQueryResults } from "./database-query-results"

export interface DatabaseQueryPanelProps {
  projectId: string
  databaseId: string
  databaseName: string
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export function DatabaseQueryPanel({
  projectId,
  databaseId,
  databaseName,
}: DatabaseQueryPanelProps) {
  const { t } = useTranslation()
  const runQuery = useRunDatabaseQuery()
  const [sql, setSql] = useState("select now();")
  const [result, setResult] = useState<RunDatabaseQueryResponse | null>(null)
  const isSqlEmpty = sql.trim().length === 0

  async function handleRunQuery() {
    if (isSqlEmpty || runQuery.isPending) return

    setResult(null)
    const response = await runQuery.mutateAsync({
      project_id: projectId,
      database_id: databaseId,
      sql,
    })
    setResult(response)
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        void handleRunQuery()
      }}
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{t("databaseQuery.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("databaseQuery.description", { databaseName })}
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="database-query-sql">{t("databaseQuery.sqlLabel")}</Label>
        <Textarea
          id="database-query-sql"
          value={sql}
          onChange={(event) => setSql(event.target.value)}
          className="min-h-[200px] font-mono"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">{t("databaseQuery.sqlHint")}</p>
      </div>

      <div className="min-h-0 flex-1 space-y-4">
        {runQuery.isError ? (
          <p className="text-sm text-destructive">
            {getErrorMessage(runQuery.error, t("databaseQuery.error"))}
          </p>
        ) : null}
        {result ? <DatabaseQueryResults result={result} /> : null}
      </div>

      <div className="flex shrink-0 justify-end border-t border-border pt-4">
        <Button type="submit" disabled={isSqlEmpty || runQuery.isPending}>
          {runQuery.isPending ? t("databaseQuery.running") : t("databaseQuery.run")}
        </Button>
      </div>
    </form>
  )
}
