import { useMemo, useState } from "react"
import { useQueries } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ArrowDown, ArrowUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { buttonPressClass } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { listResourceTags, type TagResponse } from "../api"
import { formatDraftTagLabel } from "../parse-draft-tag"
import { MobileSecretsList } from "./mobile-secrets-list"
import type { SecretRow } from "./project-detail-tab-types"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

const SECRET_DETAILS_TABLE_GRID_CLASS =
  "grid grid-cols-[400px_minmax(220px,1fr)_160px_160px] items-stretch"

type SortColumn = "name" | "tags" | "createdAt" | "updatedAt"
type SortDirection = "asc" | "desc"

interface SecretDetailsTableProps {
  projectId: string
  rows: SecretRow[]
  emptyMessage: string
  onRowClick?: (row: SecretRow) => void
}

function buildTagLabel(tag: TagResponse): string {
  return formatDraftTagLabel(tag)
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

function compareText(left: string, right: string, direction: SortDirection): number {
  const result = left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  })
  return direction === "asc" ? result : -result
}

function compareTimestamps(left: string, right: string, direction: SortDirection): number {
  const leftTime = new Date(left).getTime()
  const rightTime = new Date(right).getTime()
  const leftValue = Number.isNaN(leftTime) ? 0 : leftTime
  const rightValue = Number.isNaN(rightTime) ? 0 : rightTime
  const result = leftValue - rightValue
  return direction === "asc" ? result : -result
}

function buildTagsSortKey(tags: TagResponse[]): string {
  return tags
    .map(buildTagLabel)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))
    .join("\0")
}

function SortableColumnHeader({
  label,
  column,
  activeColumn,
  direction,
  align = "start",
  onSort,
}: {
  label: string
  column: SortColumn
  activeColumn: SortColumn | null
  direction: SortDirection
  align?: "start" | "end"
  onSort: (column: SortColumn) => void
}) {
  const isActive = activeColumn === column

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "flex h-12 items-center gap-1 px-4 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
        align === "end" && "justify-end text-right",
        isActive && "text-foreground",
      )}
    >
      <span>{label}</span>
      {isActive ? (
        direction === "asc" ? (
          <ArrowUp className="size-3.5 shrink-0" aria-hidden />
        ) : (
          <ArrowDown className="size-3.5 shrink-0" aria-hidden />
        )
      ) : null}
    </button>
  )
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
          cn(
            "cursor-pointer hover:bg-muted focus-visible:outline-none",
            buttonPressClass,
          ),
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
  const { t } = useTranslation()
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<{
    column: SortColumn
    direction: SortDirection
  }>({ column: "updatedAt", direction: "desc" })
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

  const sortedRows = useMemo(() => {
    const nextRows = [...filteredRows]
    nextRows.sort((left, right) => {
      switch (sort.column) {
        case "name":
          return compareText(left.name, right.name, sort.direction)
        case "tags": {
          const leftTags = buildTagsSortKey(tagsByRowId.get(left.id) ?? [])
          const rightTags = buildTagsSortKey(tagsByRowId.get(right.id) ?? [])
          return compareText(leftTags, rightTags, sort.direction)
        }
        case "createdAt":
          return compareTimestamps(left.createdAt, right.createdAt, sort.direction)
        case "updatedAt":
          return compareTimestamps(left.updatedAt, right.updatedAt, sort.direction)
        default:
          return 0
      }
    })
    return nextRows
  }, [filteredRows, sort, tagsByRowId])

  function defaultDirectionForColumn(column: SortColumn): SortDirection {
    return column === "createdAt" || column === "updatedAt" ? "desc" : "asc"
  }

  function handleSort(column: SortColumn) {
    setSort((current) => {
      if (current.column === column) {
        return {
          column,
          direction: current.direction === "asc" ? "desc" : "asc",
        }
      }
      return { column, direction: defaultDirectionForColumn(column) }
    })
  }

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col">
      <div className="shrink-0 p-6 pb-4">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("secrets.searchPlaceholder")}
          className="h-9 max-w-96"
        />
      </div>

      <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden pb-6 md:px-6">
        <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden md:hidden">
          <div className="flex h-10 shrink-0 items-center border-b border-border px-4 text-xs font-medium text-muted-foreground">
            {t("common.labels.name")}
          </div>
          <ScrollArea className="h-0 min-h-0 flex-1">
            <MobileSecretsList
              rows={sortedRows}
              emptyMessage={emptyMessage}
              searchQuery={search}
              onRowClick={onRowClick}
              showHeader={false}
            />
          </ScrollArea>
        </div>

        <ScrollArea type="always" className="hidden h-0 min-h-0 flex-1 md:block">
          <div className="min-w-[820px]">
            <div
              className={cn(
                SECRET_DETAILS_TABLE_GRID_CLASS,
                "sticky top-0 z-10 border-b border-border bg-card text-sm font-medium text-muted-foreground",
              )}
            >
              <SortableColumnHeader
                label={t("common.labels.name")}
                column="name"
                activeColumn={sort.column}
                direction={sort.direction}
                onSort={handleSort}
              />
              <SortableColumnHeader
                label={t("common.labels.tags")}
                column="tags"
                activeColumn={sort.column}
                direction={sort.direction}
                onSort={handleSort}
              />
              <SortableColumnHeader
                label={t("common.labels.createdAt")}
                column="createdAt"
                activeColumn={sort.column}
                direction={sort.direction}
                align="end"
                onSort={handleSort}
              />
              <SortableColumnHeader
                label={t("common.labels.updatedAt")}
                column="updatedAt"
                activeColumn={sort.column}
                direction={sort.direction}
                align="end"
                onSort={handleSort}
              />
            </div>

            {sortedRows.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">{emptyMessage}</div>
            ) : (
              sortedRows.map((row, index) => (
                <SecretDetailsTableRow
                  key={row.id}
                  row={row}
                  tags={tagsByRowId.get(row.id) ?? []}
                  searchQuery={search}
                  isLastRow={index === sortedRows.length - 1}
                  onRowClick={onRowClick}
                />
              ))
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  )
}
