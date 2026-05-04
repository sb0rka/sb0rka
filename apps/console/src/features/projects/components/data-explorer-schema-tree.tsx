import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { DataExplorerDatabaseNode } from "../hooks"

export interface DataExplorerSchemaTreeProps {
  nodes: DataExplorerDatabaseNode[]
  selectedResourceId: string | null
  onSelectDatabase: (resourceId: string) => void
}

export function DataExplorerSchemaTree({
  nodes,
  selectedResourceId,
  onSelectDatabase,
}: DataExplorerSchemaTreeProps) {
  const { t } = useTranslation()

  return (
    <div className="flex h-full min-h-0 w-56 shrink-0 flex-col border-r border-border bg-muted/20">
      <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("dataExplorer.schemaTitle")}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {nodes.map(({ database, tables }) => (
          <div key={database.resource_id} className="mb-3">
            <button
              type="button"
              onClick={() => onSelectDatabase(database.resource_id)}
              className={cn(
                "w-full rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors",
                selectedResourceId === database.resource_id
                  ? "bg-muted text-foreground"
                  : "text-foreground hover:bg-muted/60",
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
                    <div className="px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {displayName}
                    </div>
                    <ul className="border-l border-border/60 pl-2">
                      {table.columns.map((col) => (
                        <li
                          key={`${tableKey}:${col.name}`}
                          className="py-0.5 pl-2 text-xs text-muted-foreground"
                        >
                          <span className="font-mono text-foreground/90">{col.name}</span>
                          <span> · {col.data_type}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
