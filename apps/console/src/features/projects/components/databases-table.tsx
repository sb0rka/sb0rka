import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import type { DatabaseRow } from "./project-detail-tab-types"
import { getDatabaseStatusLabel } from "./get-database-status-label"

interface DatabasesTableProps {
  rows: DatabaseRow[]
  emptyMessage: string
  onRowClick?: (row: DatabaseRow) => void
}

const DATABASES_TABLE_GRID_CLASS =
  "grid w-full grid-cols-[minmax(220px,2fr)_160px_minmax(120px,1fr)_minmax(160px,1fr)_160px_160px]"

function formatLocalDateTime(value: string): string {
  if (!value) return "—"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  return date.toLocaleString()
}

export function DatabasesTable({
  rows,
  emptyMessage,
  onRowClick,
}: DatabasesTableProps) {
  const { t } = useTranslation()
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div
          className={cn(
            DATABASES_TABLE_GRID_CLASS,
            "border-b border-border text-sm font-medium text-muted-foreground",
          )}
        >
          <div className="flex h-12 items-center px-4">{t("common.labels.name")}</div>
          <div className="flex h-12 items-center px-4">{t("common.labels.id")}</div>
          <div className="flex h-12 items-center px-4">{t("common.labels.status")}</div>
          <div className="flex h-12 items-center px-4">{t("tables.diskUsage")}</div>
          <div className="flex h-12 items-center justify-end whitespace-nowrap px-4">
            {t("common.labels.createdAt")}
          </div>
          <div className="flex h-12 items-center justify-end whitespace-nowrap px-4">
            {t("common.labels.updatedAt")}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-8 text-sm text-muted-foreground">{emptyMessage}</div>
        ) : (
          rows.map((row, index) => {
            const isInteractive = Boolean(onRowClick)

            return (
              <div
                key={row.id}
                role={isInteractive ? "button" : undefined}
                tabIndex={isInteractive ? 0 : undefined}
                onClick={isInteractive ? () => onRowClick?.(row) : undefined}
                onKeyDown={
                  isInteractive
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          onRowClick?.(row)
                        }
                      }
                    : undefined
                }
                className={cn(
                  DATABASES_TABLE_GRID_CLASS,
                  index < rows.length - 1 && "border-b border-border",
                  isInteractive &&
                    "cursor-pointer transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                )}
              >
                <div className="flex min-h-20 flex-col justify-center gap-0 px-4 py-4">
                  <p className="text-sm font-medium text-foreground">{row.name}</p>
                  {row.description ? (
                    <p className="truncate text-sm text-muted-foreground">
                      {row.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex min-h-20 items-center px-4 py-4 text-sm text-foreground">
                  <span className="break-all" title={row.id}>
                    {row.id}
                  </span>
                </div>
                <div className="flex min-h-20 items-center px-4 py-4 text-sm text-foreground">
                  {getDatabaseStatusLabel(t, row.syncState, row.desiredState)}
                </div>
                <div className="flex min-h-20 items-center px-4 py-4 text-sm text-foreground">
                  0%
                </div>
                <div className="flex min-h-20 items-center justify-end whitespace-nowrap px-4 py-4 text-sm text-foreground">
                  {formatLocalDateTime(row.createdAt)}
                </div>
                <div className="flex min-h-20 items-center justify-end whitespace-nowrap px-4 py-4 text-sm text-foreground">
                  {formatLocalDateTime(row.updatedAt)}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
