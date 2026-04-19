import { cn } from "@/lib/utils"
import type { DatabaseRow } from "./project-detail-tab-types"

interface DatabasesTableProps {
  rows: DatabaseRow[]
  emptyMessage: string
  onRowClick?: (row: DatabaseRow) => void
}

const DATABASES_TABLE_GRID_CLASS =
  "grid grid-cols-[256px_115px_103px_minmax(120px,1fr)_minmax(120px,1fr)_185px]"

export function DatabasesTable({
  rows,
  emptyMessage,
  onRowClick,
}: DatabasesTableProps) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div
          className={cn(
            DATABASES_TABLE_GRID_CLASS,
            "border-b border-border text-sm font-medium text-muted-foreground",
          )}
        >
          <div className="flex h-12 items-center px-4">Название</div>
          <div className="flex h-12 items-center px-4">ID</div>
          <div className="flex h-12 items-center px-4">Колонки</div>
          <div className="flex h-12 items-center justify-end px-4">Дата создания</div>
          <div className="flex h-12 items-center justify-end px-4">Дата изменения</div>
          <div className="flex h-12 items-center justify-end px-4">Использование диска</div>
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
                  <span className="truncate" title={row.id}>
                    {row.id}
                  </span>
                </div>
                <div className="flex min-h-20 items-center px-4 py-4 text-sm text-foreground">
                  {row.columnsCount}
                </div>
                <div className="flex min-h-20 items-center justify-end px-4 py-4 text-sm text-foreground">
                  {row.createdAt}
                </div>
                <div className="flex min-h-20 items-center justify-end px-4 py-4 text-sm text-foreground">
                  {row.updatedAt}
                </div>
                <div className="flex min-h-20 items-center justify-end px-4 py-4 text-sm text-foreground">
                  —
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
