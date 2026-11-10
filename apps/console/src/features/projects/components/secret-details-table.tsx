import { useEffect, useMemo, useRef, useState } from "react"
import { useQueries } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ArrowDown, ArrowUp } from "lucide-react"
import {
  cn,
  Input,
  ScrollArea,
  ScrollBar,
} from "@sb0rka/ui"
import { formatDateTime } from "@/lib/format-date"
import { listResourceTags, type TagResponse } from "../api"
import { formatDraftTagLabel } from "../parse-draft-tag"
import { MobileSecretsList } from "./mobile-secrets-list"
import type { SecretRow } from "./project-detail-tab-types"

const SECRET_DETAILS_TABLE_GRID_CLASS =
  "grid w-full grid-cols-[minmax(0,40%)_minmax(0,14%)_minmax(0,23%)_minmax(0,23%)] items-stretch"

type SortColumn = "name" | "version" | "createdAt" | "updatedAt"
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
  align?: "start" | "center" | "end"
  onSort: (column: SortColumn) => void
}) {
  const isActive = activeColumn === column

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "flex h-12 min-w-0 items-center gap-1 px-4 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
        align === "center" && "justify-center text-center",
        align === "end" && "justify-end text-right",
        isActive && "text-foreground",
      )}
    >
      <span className="truncate">{label}</span>
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
  searchQuery,
  isLastRow,
  onRowClick,
}: {
  row: SecretRow
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
        isInteractive && "cursor-pointer hover:bg-muted focus-visible:outline-none active:!scale-100"
      )}
    >
      <div className="flex min-h-14 min-w-0 items-center px-4 py-4">
        <p className="truncate text-sm font-medium text-foreground">
          {renderHighlightedText(row.name, searchQuery)}
        </p>
      </div>
      <div className="flex min-h-14 min-w-0 items-center justify-center overflow-hidden px-4 py-4 text-center text-sm text-foreground">
        <span className="truncate">{row.currentVersionNo || "—"}</span>
      </div>
      <div className="flex min-h-14 min-w-0 items-center justify-center overflow-hidden px-4 py-4 text-center text-sm text-foreground">
        <span className="truncate">{formatDateTime(row.createdAt)}</span>
      </div>
      <div className="flex min-h-14 min-w-0 items-center justify-center overflow-hidden px-4 py-4 text-center text-sm text-foreground">
        <span className="truncate">{formatDateTime(row.updatedAt)}</span>
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
  const headerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<{
    column: SortColumn
    direction: SortDirection
  }>({ column: "createdAt", direction: "desc" })
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
        case "version": {
          const result = left.currentVersionNo - right.currentVersionNo
          return sort.direction === "asc" ? result : -result
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
  }, [filteredRows, sort])

  useEffect(() => {
    const viewport = viewportRef.current
    const header = headerRef.current
    if (!viewport || !header) return
    const sync = () => {
      header.style.transform = `translateX(-${viewport.scrollLeft}px)`
    }
    sync()
    viewport.addEventListener("scroll", sync, { passive: true })
    return () => viewport.removeEventListener("scroll", sync)
  }, [sortedRows.length])

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

        <div className="hidden h-0 min-h-0 flex-1 flex-col md:flex">
          <div className="shrink-0 overflow-hidden">
            <div
              ref={headerRef}
              className={cn(
                SECRET_DETAILS_TABLE_GRID_CLASS,
                "w-full min-w-[860px] border-b border-border bg-card text-sm font-medium text-muted-foreground",
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
                label={t("secrets.version")}
                column="version"
                activeColumn={sort.column}
                direction={sort.direction}
                align="center"
                onSort={handleSort}
              />
              <SortableColumnHeader
                label={t("common.labels.createdAt")}
                column="createdAt"
                activeColumn={sort.column}
                direction={sort.direction}
                align="center"
                onSort={handleSort}
              />
              <SortableColumnHeader
                label={t("common.labels.updatedAt")}
                column="updatedAt"
                activeColumn={sort.column}
                direction={sort.direction}
                align="center"
                onSort={handleSort}
              />
            </div>
          </div>
          <ScrollArea
            type="always"
            viewportRef={viewportRef}
            className="h-0 min-h-0 flex-1"
          >
            <div className="w-full min-w-[860px]">
              {sortedRows.length === 0 ? (
                <div className="px-4 py-8 text-sm text-muted-foreground">{emptyMessage}</div>
              ) : (
                sortedRows.map((row, index) => (
                  <SecretDetailsTableRow
                    key={row.id}
                    row={row}
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
    </div>
  )
}
