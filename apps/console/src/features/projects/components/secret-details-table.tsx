import { useMemo, useState } from "react"
import { useQueries } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { listResourceTags, type TagResponse } from "../api"
import type { SecretRow } from "./project-detail-tab-types"

const SECRET_DETAILS_TABLE_GRID_CLASS =
  "grid grid-cols-[400px_minmax(220px,1fr)_160px_160px] items-stretch"

interface SecretDetailsTableProps {
  projectId: string
  rows: SecretRow[]
  emptyMessage: string
  onRowClick?: (row: SecretRow) => void
}

function buildTagLabel(tag: TagResponse): string {
  return `${tag.tag_key}:${tag.tag_value}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function formatLocalDateTime(value: string): string {
  if (!value) return "—"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  return date.toLocaleString()
}

function renderHighlightedText(value: string, query: string): React.ReactNode {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return value

  const regex = new RegExp(`(${escapeRegExp(normalizedQuery)})`, "gi")
  const parts = value.split(regex)

  return parts.map((part, index) => {
    if (!part) return null
    const isMatch = part.toLowerCase() === normalizedQuery.toLowerCase()

    return (
      <span
        key={`${part}-${index}`}
        className={
          isMatch
            ? "font-semibold text-[#2b9a66] underline decoration-[#2b9a66]/60"
            : ""
        }
      >
        {part}
      </span>
    )
  })
}

function SecretDetailsTableRow({
  row,
  tags,
  searchQuery,
  isLastRow,
  onRowClick,
}: {
  row: SecretRow
  tags: TagResponse[]
  searchQuery: string
  isLastRow: boolean
  onRowClick?: (row: SecretRow) => void
}) {
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
        !isLastRow && "border-b border-border",
        isInteractive &&
          "cursor-pointer transition-colors hover:bg-muted focus-visible:outline-none",
      )}
    >
      <div className="flex min-h-14 items-center px-4 py-4">
        <p className="truncate text-sm font-medium text-foreground">
          {renderHighlightedText(row.name, searchQuery)}
        </p>
      </div>
      <div className="flex min-h-14 flex-wrap items-center gap-2 px-4 py-4">
        {tags.length ? (
          tags.map((tag) => (
            <Badge
              key={tag.id}
              className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold leading-4 text-secondary-foreground hover:bg-secondary"
            >
              {renderHighlightedText(buildTagLabel(tag), searchQuery)}
            </Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </div>
      <div className="flex min-h-14 items-center justify-end whitespace-nowrap px-4 py-4 text-sm text-foreground">
        {formatLocalDateTime(row.createdAt)}
      </div>
      <div className="flex min-h-14 items-center justify-end whitespace-nowrap px-4 py-4 text-sm text-foreground">
        {formatLocalDateTime(row.updatedAt)}
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
  const tagQueries = useQueries({
    queries: rows.map((row) => ({
      queryKey: ["projects", projectId, "resources", row.id, "tags"],
      queryFn: () => listResourceTags(projectId, row.id),
      enabled: !!projectId,
    })),
  })
  const tagsByRowId = useMemo(() => {
    const map = new Map<string, TagResponse[]>()
    for (let index = 0; index < rows.length; index += 1) {
      map.set(rows[index].id, tagQueries[index]?.data?.tags ?? [])
    }
    return map
  }, [rows, tagQueries])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) => {
      if (row.name.toLowerCase().includes(query)) return true

      const tags = tagsByRowId.get(row.id) ?? []
      return tags.some((tag) => buildTagLabel(tag).toLowerCase().includes(query))
    })
  }, [rows, search, tagsByRowId])

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
                  row={row}
                  tags={tagsByRowId.get(row.id) ?? []}
                  searchQuery={search}
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
