import { useTranslation } from "react-i18next"
import type { RunDatabaseQueryResponse } from "../api"

export function formatQueryCellValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

export function DatabaseQueryResults({ result }: { result: RunDatabaseQueryResponse }) {
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
        <div className="max-h-[min(560px,60vh)] overflow-auto rounded-md border border-border">
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
                      title={formatQueryCellValue(row[columnIndex])}
                    >
                      {formatQueryCellValue(row[columnIndex])}
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
