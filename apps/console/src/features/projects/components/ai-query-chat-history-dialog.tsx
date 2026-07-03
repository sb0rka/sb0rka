import { useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Bookmark, ClipboardPaste, Clock3, Loader2, Play, Star, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getResolvedLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { SqlExplorerHistoryItem } from "../sql-explorer-history-storage"

export type AiQueryChatHistoryView = "history" | "bookmarks"

export type AiQueryChatHistoryDialogProps = {
  view: AiQueryChatHistoryView
  historyItems: SqlExplorerHistoryItem[]
  bookmarkItems: SqlExplorerHistoryItem[]
  isLoading?: boolean
  applySqlAndRunDisabled?: boolean
  isQueryRunning?: boolean
  onViewChange: (view: AiQueryChatHistoryView) => void
  onApplySql?: (sql: string, title: string) => void
  onApplySqlAndRun?: (sql: string, title: string) => void
  onToggleBookmark?: (item: SqlExplorerHistoryItem) => void
}

function formatHistoryDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat(getResolvedLanguage(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function filterSqlHistoryItems(
  items: SqlExplorerHistoryItem[],
  query: string,
): SqlExplorerHistoryItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.sql.toLowerCase().includes(q),
  )
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function renderHighlightedText(value: string, query: string): ReactNode {
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
            : undefined
        }
      >
        {part}
      </span>
    )
  })
}

function SqlHistoryList({
  items,
  sourceItemCount,
  emptyMessage,
  noResultsMessage,
  searchQuery = "",
  isLoading,
  applySqlAndRunDisabled,
  isQueryRunning,
  onApplySql,
  onApplySqlAndRun,
  onToggleBookmark,
}: {
  items: SqlExplorerHistoryItem[]
  sourceItemCount: number
  emptyMessage: string
  noResultsMessage?: string
  searchQuery?: string
  isLoading?: boolean
  applySqlAndRunDisabled?: boolean
  isQueryRunning?: boolean
  onApplySql?: (sql: string, title: string) => void
  onApplySqlAndRun?: (sql: string, title: string) => void
  onToggleBookmark?: (item: SqlExplorerHistoryItem) => void
}) {
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("common.loading")}
      </div>
    )
  }

  if (sourceItemCount === 0) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center">
        <p className="text-sm text-muted-foreground">{noResultsMessage}</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full pr-3">
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-lg border border-border/70 bg-muted/20 p-3"
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-medium text-foreground">
                  {renderHighlightedText(item.title, searchQuery)}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatHistoryDate(item.createdAt)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground",
                  item.bookmarked && "text-primary",
                )}
                onClick={() => onToggleBookmark?.(item)}
                aria-label={
                  item.bookmarked
                    ? t("dataExplorer.aiChatUnbookmarkSql")
                    : t("dataExplorer.aiChatBookmarkSql")
                }
              >
                <Star className={cn("h-4 w-4", item.bookmarked && "fill-current")} />
              </Button>
            </div>
            <pre className="mt-3 max-h-24 overflow-hidden whitespace-pre-wrap rounded-md bg-background/70 p-2 font-mono text-xs text-muted-foreground">
              {renderHighlightedText(item.sql, searchQuery)}
            </pre>
            <div className="mt-3 flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5"
                disabled={!onApplySql}
                onClick={() => onApplySql?.(item.sql, item.title)}
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
                {t("dataExplorer.aiChatApplySql")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5"
                disabled={!onApplySqlAndRun || Boolean(applySqlAndRunDisabled)}
                onClick={() => onApplySqlAndRun?.(item.sql, item.title)}
              >
                {isQueryRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {isQueryRunning
                  ? t("databaseQuery.running")
                  : t("dataExplorer.aiChatApplySqlAndRun")}
              </Button>
            </div>
          </article>
        ))}
      </div>
    </ScrollArea>
  )
}

export function AiQueryChatHistoryDialog({
  view,
  historyItems,
  bookmarkItems,
  isLoading,
  applySqlAndRunDisabled,
  isQueryRunning,
  onViewChange,
  onApplySql,
  onApplySqlAndRun,
  onToggleBookmark,
}: AiQueryChatHistoryDialogProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState("")
  const description = useMemo(
    () =>
      view === "bookmarks"
        ? t("dataExplorer.aiChatBookmarksDescription")
        : t("dataExplorer.aiChatHistoryDescription"),
    [t, view],
  )
  const filteredHistory = useMemo(
    () => filterSqlHistoryItems(historyItems, search),
    [historyItems, search],
  )
  const filteredBookmarks = useMemo(
    () => filterSqlHistoryItems(bookmarkItems, search),
    [bookmarkItems, search],
  )
  const noResultsMessage = useMemo(
    () => t("dataExplorer.aiChatHistoryNoResults", { query: search.trim() }),
    [search, t],
  )

  return (
    <div className="flex h-full w-[min(42rem,calc(100vw-2rem))] min-h-0 flex-col rounded-xl border border-border bg-card pr-3 pl-6 py-2 shadow-lg">
      <div className="mb-4 shrink-0">
        <p className="text-sm font-medium">{t("dataExplorer.aiChatHistoryDialogTitle")}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Tabs
        value={view}
        onValueChange={(value) => onViewChange(value as AiQueryChatHistoryView)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="grid w-full shrink-0 grid-cols-2">
          <TabsTrigger value="history" className="gap-1.5">
            <Clock3 className="h-3.5 w-3.5" />
            {t("dataExplorer.aiChatHistory")}
          </TabsTrigger>
          <TabsTrigger value="bookmarks" className="gap-1.5">
            <Bookmark className="h-3.5 w-3.5" />
            {t("dataExplorer.aiChatBookmarks")}
          </TabsTrigger>
        </TabsList>
        <div className="relative my-3 shrink-0">
          <Input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder={t("dataExplorer.aiChatHistorySearchPlaceholder")}
            className="h-8 w-full pr-8"
          />
          {search.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              aria-label={t("dataExplorer.aiChatMenuClearFilter")}
              title={t("dataExplorer.aiChatMenuClearFilter")}
              onClick={() => setSearch("")}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          ) : null}
        </div>
        <TabsContent value="history" className="min-h-0 flex-1">
          <SqlHistoryList
            items={filteredHistory}
            sourceItemCount={historyItems.length}
            emptyMessage={t("dataExplorer.aiChatHistoryEmpty")}
            noResultsMessage={noResultsMessage}
            searchQuery={search}
            isLoading={isLoading}
            applySqlAndRunDisabled={applySqlAndRunDisabled}
            isQueryRunning={isQueryRunning}
            onApplySql={onApplySql}
            onApplySqlAndRun={onApplySqlAndRun}
            onToggleBookmark={onToggleBookmark}
          />
        </TabsContent>
        <TabsContent value="bookmarks" className="min-h-0 flex-1">
          <SqlHistoryList
            items={filteredBookmarks}
            sourceItemCount={bookmarkItems.length}
            emptyMessage={t("dataExplorer.aiChatBookmarksEmpty")}
            noResultsMessage={noResultsMessage}
            searchQuery={search}
            isLoading={isLoading}
            applySqlAndRunDisabled={applySqlAndRunDisabled}
            isQueryRunning={isQueryRunning}
            onApplySql={onApplySql}
            onApplySqlAndRun={onApplySqlAndRun}
            onToggleBookmark={onToggleBookmark}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
