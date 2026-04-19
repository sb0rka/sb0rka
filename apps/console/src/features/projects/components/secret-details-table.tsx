import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useResourceTags } from "../hooks"
import type { SecretRow } from "./project-detail-tab-types"

const SECRET_DETAILS_TABLE_GRID_CLASS =
  "grid grid-cols-[200px_minmax(220px,1fr)_fit-content(8.5rem)_fit-content(8.5rem)] items-stretch"

interface SecretDetailsTableProps {
  projectId: string
  rows: SecretRow[]
  emptyMessage: string
  onRowClick?: (row: SecretRow) => void
}

function SecretDetailsTableRow({
  projectId,
  row,
  isLastRow,
  onRowClick,
}: {
  projectId: string
  row: SecretRow
  isLastRow: boolean
  onRowClick?: (row: SecretRow) => void
}) {
  const tagsQuery = useResourceTags(projectId, row.id)
  const isInteractive = Boolean(onRowClick)

  return (
    <div
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
        SECRET_DETAILS_TABLE_GRID_CLASS,
        row.isHighlighted && "bg-muted",
        !isLastRow && "border-b border-border",
        isInteractive &&
          "cursor-pointer transition-colors hover:bg-muted/70 focus-visible:bg-muted/70 focus-visible:outline-none",
      )}
    >
      <div className="flex min-h-14 items-center px-4 py-4">
        <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
      </div>
      <div className="flex min-h-14 flex-wrap items-center gap-2 px-4 py-4">
        {tagsQuery.data?.tags.length ? (
          tagsQuery.data.tags.map((tag) => (
            <Badge
              key={tag.id}
              className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold leading-4 text-secondary-foreground hover:bg-secondary"
            >
              {`${tag.tag_key}:${tag.tag_value}`}
            </Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </div>
      <div className="flex min-h-14 items-center justify-end whitespace-nowrap px-4 py-4 text-sm text-foreground">
        {row.createdAt}
      </div>
      <div className="flex min-h-14 items-center justify-end whitespace-nowrap px-4 py-4 text-sm text-foreground">
        {row.updatedAt}
      </div>
    </div>
  )
}

export function SecretDetailsTable({
  projectId,
  rows,
  emptyMessage,
  onRowClick,
}: SecretDetailsTableProps) {
  const [search, setSearch] = useState("")

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) => row.name.toLowerCase().includes(query))
  }, [rows, search])

  return (
    <div className="flex flex-col">
      <div className="p-6 pb-4">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск..."
          className="h-9 max-w-96"
        />
      </div>

      <div className="px-6 pb-6">
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div
              className={cn(
                SECRET_DETAILS_TABLE_GRID_CLASS,
                "border-b border-border text-sm font-medium text-muted-foreground",
              )}
            >
              <div className="flex h-12 items-center px-4">Название</div>
              <div className="flex h-12 items-center px-4">Теги</div>
              <div className="flex h-12 items-center justify-end whitespace-nowrap px-4">
                Дата создания
              </div>
              <div className="flex h-12 items-center justify-end whitespace-nowrap px-4">
                Дата изменения
              </div>
            </div>

            {filteredRows.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">{emptyMessage}</div>
            ) : (
              filteredRows.map((row, index) => (
                <SecretDetailsTableRow
                  key={row.id}
                  projectId={projectId}
                  row={row}
                  isLastRow={index === filteredRows.length - 1}
                  onRowClick={onRowClick}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
