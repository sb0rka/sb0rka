import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ApiError } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useRunDatabaseQuery } from "../hooks"
import type { RunDatabaseQueryResponse } from "../api"

interface DatabaseQueryDialogProps {
  projectId: string
  databaseId: string
  databaseName: string
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function QueryResults({ result }: { result: RunDatabaseQueryResponse }) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>{t("databaseQuery.rowCount", { count: result.row_count })}</span>
        <span>{t("databaseQuery.duration", { duration: result.duration_ms })}</span>
        {result.truncated ? (
          <span className="font-medium text-amber-600">{t("databaseQuery.truncated")}</span>
        ) : null}
      </div>

      {result.rows.length === 0 ? (
        <p className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
          {t("databaseQuery.empty")}
        </p>
      ) : (
        <div className="max-h-[360px] overflow-auto rounded-md border border-border">
          <table className="w-full min-w-max text-left text-sm">
            <thead className="sticky top-0 bg-card text-muted-foreground">
              <tr>
                {result.columns.map((column) => (
                  <th key={column} className="border-b border-border px-3 py-2 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border last:border-b-0">
                  {result.columns.map((column, columnIndex) => (
                    <td
                      key={`${rowIndex}-${column}`}
                      className="max-w-[280px] truncate px-3 py-2 font-mono text-xs"
                      title={formatCellValue(row[columnIndex])}
                    >
                      {formatCellValue(row[columnIndex])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function DatabaseQueryDialog({
  projectId,
  databaseId,
  databaseName,
}: DatabaseQueryDialogProps) {
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
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          {t("databaseQuery.open")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <form
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault()
            void handleRunQuery()
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("databaseQuery.title")}</DialogTitle>
            <DialogDescription>
              {t("databaseQuery.description", { databaseName })}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 px-6">
            <Label htmlFor="database-query-sql">{t("databaseQuery.sqlLabel")}</Label>
            <Textarea
              id="database-query-sql"
              value={sql}
              onChange={(event) => setSql(event.target.value)}
              className="min-h-[160px] font-mono"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">{t("databaseQuery.sqlHint")}</p>
          </div>

          <div className="px-6">
            {runQuery.isError ? (
              <p className="text-sm text-destructive">
                {getErrorMessage(runQuery.error, t("databaseQuery.error"))}
              </p>
            ) : null}
            {result ? <QueryResults result={result} /> : null}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSqlEmpty || runQuery.isPending}>
              {runQuery.isPending ? t("databaseQuery.running") : t("databaseQuery.run")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
