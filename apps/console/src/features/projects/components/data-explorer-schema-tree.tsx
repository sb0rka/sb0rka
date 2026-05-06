import { useCallback, useLayoutEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DataExplorerDatabaseNode } from "../hooks"

export interface DataExplorerSchemaTreeProps {
  nodes: DataExplorerDatabaseNode[]
  selectedResourceId: string | null
  onSelectDatabase: (resourceId: string) => void
  isSchemaRefetching?: boolean
}

/** resource_id → tree expanded (independent of selection) */
type DatabaseExpandedMap = Record<string, boolean>

/** resource_id → tableKey → expanded (missing key → default from table count) */
type ExpandedTablesMap = Record<string, Record<string, boolean>>

function isTableExpanded(
  map: ExpandedTablesMap,
  resourceId: string,
  tableKey: string,
  tableCount: number,
): boolean {
  const v = map[resourceId]?.[tableKey]
  if (v !== undefined) return v
  return tableCount <= 3
}

export function DataExplorerSchemaTree({
  nodes,
  selectedResourceId,
  onSelectDatabase,
  isSchemaRefetching = false,
}: DataExplorerSchemaTreeProps) {
  const { t } = useTranslation()
  const [databaseExpanded, setDatabaseExpanded] = useState<DatabaseExpandedMap>({})
  const [expandedTables, setExpandedTables] = useState<ExpandedTablesMap>({})

  useLayoutEffect(() => {
    if (!selectedResourceId) return
    setDatabaseExpanded((prev) => ({ ...prev, [selectedResourceId]: true }))
  }, [selectedResourceId])

  const toggleDatabaseExpanded = useCallback((resourceId: string) => {
    setDatabaseExpanded((prev) => {
      const open = prev[resourceId] ?? false
      return { ...prev, [resourceId]: !open }
    })
  }, [])

  const toggleTableExpanded = useCallback(
    (resourceId: string, tableKey: string, tableCount: number) => {
      setExpandedTables((prev) => {
        const current = isTableExpanded(prev, resourceId, tableKey, tableCount)
        return {
          ...prev,
          [resourceId]: {
            ...(prev[resourceId] ?? {}),
            [tableKey]: !current,
          },
        }
      })
    },
    [],
  )

  return (
    <div
      className="relative flex h-full min-h-0 w-56 shrink-0 flex-col border-r border-border bg-muted/20 font-sans"
      aria-busy={isSchemaRefetching}
    >
      {isSchemaRefetching ? (
        <div
          className="pointer-events-none absolute right-3 top-3 z-10 bg-transparent p-1"
          aria-hidden
        >
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      <div className="shrink-0 px-3 pb-2 pt-3 text-xs font-semibold text-muted-foreground">
        {t("dataExplorer.schemaTreeDatabases", { count: nodes.length })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <ul className="space-y-0.5">
          {nodes.map(({ database, tables }) => {
            const isSelected = selectedResourceId === database.resource_id
            const tableCount = tables.length
            const dbOpen = databaseExpanded[database.resource_id] ?? false

            return (
              <li key={database.resource_id}>
                <div
                  className={cn(
                    "flex w-full items-center gap-0.5 rounded-sm py-1 pl-0.5 pr-1.5",
                    isSelected ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={dbOpen}
                    aria-label={t("dataExplorer.toggleDatabaseSchema", {
                      name: database.name,
                    })}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleDatabaseExpanded(database.resource_id)
                    }}
                    className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  >
                    <ChevronRight
                      className={cn(
                        "size-3.5 shrink-0 transition-transform",
                        dbOpen && "rotate-90",
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectDatabase(database.resource_id)}
                    className={cn(
                      "min-w-0 flex-1 truncate rounded-sm py-0 text-left text-xs font-medium transition-colors",
                      isSelected
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {database.name}
                  </button>
                </div>

                {dbOpen ? (
                  <ul className="mt-0.5 space-y-0.5 border-l border-border/70 pl-2 ml-2.5">
                    {tables.map((table) => {
                      const tableKey = `${table.schema}.${table.name}`
                      const displayName =
                        table.schema === "public"
                          ? table.name
                          : `${table.schema}.${table.name}`
                      const tableOpen = isTableExpanded(
                        expandedTables,
                        database.resource_id,
                        tableKey,
                        tableCount,
                      )

                      return (
                        <li key={tableKey}>
                          <button
                            type="button"
                            aria-expanded={tableOpen}
                            onClick={() =>
                              toggleTableExpanded(
                                database.resource_id,
                                tableKey,
                                tableCount,
                              )
                            }
                            className={cn(
                              "flex w-full items-center gap-0.5 rounded-sm py-0.5 pl-0 pr-1 text-left text-xs text-foreground",
                              "hover:bg-muted/50",
                            )}
                          >
                            <span
                              className="flex size-5 shrink-0 items-center justify-center text-muted-foreground"
                              aria-hidden
                            >
                              <ChevronRight
                                className={cn(
                                  "size-3.5 shrink-0 transition-transform",
                                  tableOpen && "rotate-90",
                                )}
                              />
                            </span>
                            <span className="min-w-0 truncate font-medium">
                              {displayName}
                            </span>
                          </button>

                          {tableOpen ? (
                            <ul className="ml-6 border-l border-border/60 pl-2 py-0.5">
                              {table.columns.map((col) => (
                                <li
                                  key={`${tableKey}:${col.name}`}
                                  className="py-0.5 text-xs text-muted-foreground"
                                >
                                  {col.name} · {col.data_type}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
