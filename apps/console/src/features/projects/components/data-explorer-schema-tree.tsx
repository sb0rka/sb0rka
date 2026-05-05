import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DataExplorerDatabaseNode } from "../hooks"

export interface DataExplorerSchemaTreeProps {
  nodes: DataExplorerDatabaseNode[]
  selectedResourceId: string | null
  onSelectDatabase: (resourceId: string) => void
  isSchemaRefetching?: boolean
}

export function DataExplorerSchemaTree({
  nodes,
  selectedResourceId,
  onSelectDatabase,
  isSchemaRefetching = false,
}: DataExplorerSchemaTreeProps) {

  return (
    <div
      className="relative flex h-full min-h-0 w-56 shrink-0 flex-col border-r border-border bg-muted/20"
      aria-busy={isSchemaRefetching}
    >
      {isSchemaRefetching ? (
        <>
          {/* <div
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 overflow-hidden rounded-none bg-muted"
            aria-hidden
          >
            <div className="h-full w-full animate-pulse bg-primary/70" />
          </div> */}
          <div
            className="pointer-events-none absolute right-4 top-[18px] z-10  bg-transparent p-1.5"
            aria-hidden
          >
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        </>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-4 gap-4">
        {nodes.map(({ database, tables }) => {
          const isSelected = selectedResourceId === database.resource_id
          return (
            <div key={database.resource_id} className="mb-3">
              <button
                type="button"
                onClick={() => onSelectDatabase(database.resource_id)}
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors",
                  isSelected
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground/85",
                )}
              >
                {database.name}
              </button>
              <ul className="mt-1 space-y-1 pl-2">
                {tables.map((table) => {
                  const tableKey = `${table.schema}.${table.name}`
                  const displayName =
                    table.schema === "public" ? table.name : `${table.schema}.${table.name}`
                  return (
                    <li key={tableKey}>
                      <div
                        className={cn(
                          "px-2 py-0.5 text-xs font-medium",
                          isSelected ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {displayName}
                      </div>
                      <ul
                        className={cn(
                          "border-l pl-2",
                          isSelected ? "border-border" : "border-border/60",
                        )}
                      >
                        {table.columns.map((col) => (
                          <li
                            key={`${tableKey}:${col.name}`}
                            className={cn(
                              "py-0.5 pl-2 text-xs",
                              isSelected
                                ? "text-foreground/85"
                                : "text-muted-foreground",
                            )}
                          >
                            <span
                              className={cn(
                                "font-mono",
                                isSelected ? "text-foreground" : "text-foreground/90",
                              )}
                            >
                              {col.name}
                            </span>
                            <span> · {col.data_type}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
