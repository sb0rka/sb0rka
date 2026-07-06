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
import { cn } from "@/lib/utils"
import type { RunDatabaseQueryResponse } from "../api"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

const queryTableCellBottomBorderClass = "border-b border-border/70"

function queryTableCellBorderClass(columnIndex: number, columnCount: number) {
  return cn(
    queryTableCellBottomBorderClass,
    columnIndex < columnCount - 1 && "border-r border-border/70",
  )
}

function queryTableHeaderCellStyle(columnIndex: number, columnCount: number) {
  const divider = "color-mix(in oklab, var(--border) 70%, transparent)"
  const shadows = [`inset 0 -1px 0 0 ${divider}`]
  if (columnIndex < columnCount - 1) {
    shadows.unshift(`inset -1px 0 0 0 ${divider}`)
  }
  return { boxShadow: shadows.join(", ") }
}

export function formatQueryCellValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

export function DatabaseQueryResults({ result }: { result: RunDatabaseQueryResponse }) {
  const { t } = useTranslation()
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)

  function renderResultTable(heightClassName: string, borderClassName: string) {
    return (
      <ScrollArea
        type="always"
        className={`${heightClassName} ${borderClassName} border-border/80 bg-background`}
      >
        <table className="h-max w-max border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 text-muted-foreground">
            <tr>
              {result.columns.map((column, columnIndex) => (
                <th
                  key={column}
                  style={queryTableHeaderCellStyle(columnIndex, result.columns.length)}
                  className="relative z-10 bg-card/95 px-3 py-2.5 text-center text-xs font-semibold tracking-wide text-muted-foreground backdrop-blur"
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
                className={`transition-colors hover:bg-accent/40 ${
                  rowIndex % 2 === 0 ? "bg-background" : "bg-secondary/50"
                }`}
              >
                {result.columns.map((column, columnIndex) => (
                  <td
                    key={`${rowIndex}-${column}`}
                    className={cn(
                      queryTableCellBorderClass(columnIndex, result.columns.length),
                      "max-w-[320px] truncate px-3 py-2.5 align-top font-mono text-sm leading-6 text-foreground/95 tabular-nums",
                    )}
                    title={formatQueryCellValue(row[columnIndex])}
                  >
                    {formatQueryCellValue(row[columnIndex])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <ScrollBar orientation="horizontal"/>
      </ScrollArea>
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
          {renderResultTable("h-full", "border")}
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
          <div className="min-h-0 flex-1 overflow-hidden">
            {renderResultTable("h-full", "")}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
