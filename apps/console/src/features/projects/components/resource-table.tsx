import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"

interface ResourceTableRow {
  id: string
  name: string
  description?: string
  tablesCount: string | number
  columnsCount: string | number
  createdAt: string
  updatedAt: string
  isHighlighted: boolean
}

interface ResourceTableProps<T extends ResourceTableRow> {
  rows: T[]
  emptyMessage: string
  containerPaddingClassName?: string
  cellPaddingClassName?: string
  onRowClick?: (row: T) => void
}

const RESOURCE_TABLE_GRID_CLASS = "grid grid-cols-[2.4fr_1fr_1fr_1.3fr_1.3fr]"

function ResourceTableRowContent({
  row,
  cellPaddingClassName,
}: {
  row: ResourceTableRow
  cellPaddingClassName?: string
}) {
  return (
    <>
      <div
        className={cn(
          "flex min-h-20 flex-col justify-center py-3",
          cellPaddingClassName,
        )}
      >
        <p className="text-sm font-medium text-foreground">{row.name}</p>
        {row.description ? (
          <p className="truncate text-sm text-muted-foreground">{row.description}</p>
        ) : null}
      </div>
      <div
        className={cn(
          "flex min-h-20 items-center py-3 text-sm text-foreground",
          cellPaddingClassName,
        )}
      >
        {row.tablesCount}
      </div>
      <div
        className={cn(
          "flex min-h-20 items-center py-3 text-sm text-foreground",
          cellPaddingClassName,
        )}
      >
        {row.columnsCount}
      </div>
      <div
        className={cn(
          "flex min-h-20 items-center justify-end py-3 text-sm text-foreground",
          cellPaddingClassName,
        )}
      >
        {row.createdAt}
      </div>
      <div
        className={cn(
          "flex min-h-20 items-center justify-end py-3 text-sm text-foreground",
          cellPaddingClassName,
        )}
      >
        {row.updatedAt}
      </div>
    </>
  )
}

export function ResourceTable<T extends ResourceTableRow>({
  rows,
  emptyMessage,
  containerPaddingClassName,
  cellPaddingClassName,
  onRowClick,
}: ResourceTableProps<T>) {
  const { t } = useTranslation()
  return (
    <>
      <div
        className={cn(
          RESOURCE_TABLE_GRID_CLASS,
          "border-b border-border text-sm font-medium text-muted-foreground",
          containerPaddingClassName,
        )}
      >
        <div className={cn("flex h-12 items-center", cellPaddingClassName)}>
          {t("common.labels.name")}
        </div>
        <div className={cn("flex h-12 items-center", cellPaddingClassName)}>
          {t("tables.tables")}
        </div>
        <div className={cn("flex h-12 items-center", cellPaddingClassName)}>
          {t("tables.columns")}
        </div>
        <div className={cn("flex h-12 items-center justify-end", cellPaddingClassName)}>
          {t("common.labels.createdAt")}
        </div>
        <div className={cn("flex h-12 items-center justify-end", cellPaddingClassName)}>
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
                RESOURCE_TABLE_GRID_CLASS,
                containerPaddingClassName,
                row.isHighlighted && "bg-muted/70",
                index < rows.length - 1 && "border-b border-border",
                isInteractive &&
                  "cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
              )}
            >
              <ResourceTableRowContent
                row={row}
                cellPaddingClassName={cellPaddingClassName}
              />
            </div>
          )
        })
      )}
    </>
  )
}
