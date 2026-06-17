import { buttonPressClass } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import type { DatabaseRow } from "./project-detail-tab-types"
import { getDatabaseStatusLabel } from "./get-database-status-label"

interface MobileDatabasesListProps {
  rows: DatabaseRow[]
  emptyMessage: string
  onRowClick?: (row: DatabaseRow) => void
}

const ROW_CELL_CLASS = "flex h-20 items-center border-b border-border px-4 py-4 last:border-b-0"

export function MobileDatabasesList({
  rows,
  emptyMessage,
  onRowClick,
}: MobileDatabasesListProps) {
  const { t } = useTranslation()

  if (rows.length === 0) {
    return <div className="px-4 py-8 text-sm text-muted-foreground">{emptyMessage}</div>
  }

  return (
    <div className="flex w-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center border-b border-border px-4 text-sm font-medium text-muted-foreground">
          {t("common.labels.name")}
        </div>
        {rows.map((row) => {
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
                ROW_CELL_CLASS,
                "flex-col items-start justify-center gap-0 overflow-hidden",
                isInteractive &&
                  cn(
                    "cursor-pointer hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                    buttonPressClass,
                  ),
              )}
            >
              <p className="text-sm font-medium text-foreground">{row.name}</p>
              {row.description ? (
                <p className="truncate text-sm text-muted-foreground">{row.description}</p>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="flex shrink-0 flex-col">
        <div className="flex h-12 items-center border-b border-border px-4 text-sm font-medium text-muted-foreground">
          {t("common.labels.status")}
        </div>
        {rows.map((row) => {
          const isInteractive = Boolean(onRowClick)

          return (
            <div
              key={row.id}
              aria-hidden={isInteractive ? true : undefined}
              onClick={isInteractive ? () => onRowClick?.(row) : undefined}
              className={cn(
                ROW_CELL_CLASS,
                "whitespace-nowrap text-sm text-foreground",
                isInteractive &&
                  cn("cursor-pointer hover:bg-muted", buttonPressClass),
              )}
            >
              {getDatabaseStatusLabel(t, row.syncState, row.desiredState)}
            </div>
          )
        })}
      </div>

      <div className="flex shrink-0 flex-col">
        <div className="flex h-12 items-center justify-end border-b border-border px-4 text-sm font-medium text-muted-foreground">
          {t("tables.diskUsage")}
        </div>
        {rows.map((row) => {
          const isInteractive = Boolean(onRowClick)

          return (
            <div
              key={row.id}
              aria-hidden={isInteractive ? true : undefined}
              onClick={isInteractive ? () => onRowClick?.(row) : undefined}
              className={cn(
                ROW_CELL_CLASS,
                "justify-end whitespace-nowrap text-sm text-foreground",
                isInteractive &&
                  cn("cursor-pointer hover:bg-muted", buttonPressClass),
              )}
            >
              {row.diskUsageLabel}
            </div>
          )
        })}
      </div>
    </div>
  )
}
