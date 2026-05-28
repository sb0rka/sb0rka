import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { hideScrollbarClass } from "./ai-query-chat-message-styles"
import type { RunDatabaseQueryResponse } from "../api"

export function formatQueryCellValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

export function DatabaseQueryResults({ result }: { result: RunDatabaseQueryResponse }) {
  const { t } = useTranslation()
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)

  function renderResultTable(heightClassName: string) {
    return (
      <div
        className={`${heightClassName} overflow-auto rounded-md border border-border/80 bg-background ${hideScrollbarClass}`}
      >
        <table className="w-full min-w-max text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-border/90 bg-card/95 text-muted-foreground backdrop-blur">
            <tr>
              {result.columns.map((column) => (
                <th
                  key={column}
                  className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={`border-b border-border/70 transition-colors last:border-b-0 hover:bg-accent/40 ${
                  rowIndex % 2 === 0 ? "bg-background" : "bg-secondary/50"
                }`}
              >
                {result.columns.map((column, columnIndex) => (
                  <td
                    key={`${rowIndex}-${column}`}
                    className="max-w-[320px] truncate px-3 py-2.5 font-mono text-sm leading-6 text-foreground/95 tabular-nums"
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
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{t("databaseQuery.rowCount", { count: result.row_count })}</span>
          <span>{t("databaseQuery.duration", { duration: result.duration_ms })}</span>
          {result.truncated ? (
            <span className="font-medium text-amber-600">{t("databaseQuery.truncated")}</span>
          ) : null}
        </div>
        {result.rows.length > 0 ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setIsFullscreenOpen(true)}>
            {t("databaseQuery.fullscreen")}
          </Button>
        ) : null}
      </div>

      {result.rows.length === 0 ? (
        <p className="shrink-0 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
          {t("databaseQuery.empty")}
        </p>
      ) : (
        <div className="min-h-0 flex-1">
          {renderResultTable("h-full")}
        </div>
      )}

      <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
        <DialogContent className="flex h-[90vh] w-[95vw] max-w-none flex-col overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>{t("databaseQuery.fullscreenTitle")}</DialogTitle>
            <DialogDescription>
              {t("databaseQuery.rowCount", { count: result.row_count })} •{" "}
              {t("databaseQuery.duration", { duration: result.duration_ms })}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden px-6 pb-6">
            {renderResultTable("h-full")}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
