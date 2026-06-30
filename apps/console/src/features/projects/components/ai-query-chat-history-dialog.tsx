import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Bookmark, ClipboardPaste, Clock3, Loader2, Play, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getResolvedLanguage } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { SqlExplorerHistoryItem } from "../sql-explorer-history-storage"

export type AiQueryChatHistoryView = "history" | "bookmarks"

export type AiQueryChatHistoryDialogProps = {
  open: boolean
  view: AiQueryChatHistoryView
  historyItems: SqlExplorerHistoryItem[]
  bookmarkItems: SqlExplorerHistoryItem[]
  isLoading?: boolean
  applySqlAndRunDisabled?: boolean
  isQueryRunning?: boolean
  onOpenChange: (open: boolean) => void
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

function SqlHistoryList({
  items,
  emptyMessage,
  isLoading,
  applySqlAndRunDisabled,
  isQueryRunning,
  onApplySql,
  onApplySqlAndRun,
  onToggleBookmark,
}: {
  items: SqlExplorerHistoryItem[]
  emptyMessage: string
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

  if (items.length === 0) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-[min(28rem,60vh)] pr-3">
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <article
            key={item.id}
            className="rounded-lg border border-border/70 bg-muted/20 p-3"
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-medium text-foreground">{item.title}</h3>
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
              {item.sql}
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
  open,
  view,
  historyItems,
  bookmarkItems,
  isLoading,
  applySqlAndRunDisabled,
  isQueryRunning,
  onOpenChange,
  onViewChange,
  onApplySql,
  onApplySqlAndRun,
  onToggleBookmark,
}: AiQueryChatHistoryDialogProps) {
  const { t } = useTranslation()
  const description = useMemo(
    () =>
      view === "bookmarks"
        ? t("dataExplorer.aiChatBookmarksDescription")
        : t("dataExplorer.aiChatHistoryDescription"),
    [t, view],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <DialogHeader className="pb-2">
          <DialogTitle>{t("dataExplorer.aiChatHistoryDialogTitle")}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-6">
          <Tabs value={view} onValueChange={(value) => onViewChange(value as AiQueryChatHistoryView)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="history" className="gap-1.5">
                <Clock3 className="h-3.5 w-3.5" />
                {t("dataExplorer.aiChatHistory")}
              </TabsTrigger>
              <TabsTrigger value="bookmarks" className="gap-1.5">
                <Bookmark className="h-3.5 w-3.5" />
                {t("dataExplorer.aiChatBookmarks")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="history">
              <SqlHistoryList
                items={historyItems}
                emptyMessage={t("dataExplorer.aiChatHistoryEmpty")}
                isLoading={isLoading}
                applySqlAndRunDisabled={applySqlAndRunDisabled}
                isQueryRunning={isQueryRunning}
                onApplySql={onApplySql}
                onApplySqlAndRun={onApplySqlAndRun}
                onToggleBookmark={onToggleBookmark}
              />
            </TabsContent>
            <TabsContent value="bookmarks">
              <SqlHistoryList
                items={bookmarkItems}
                emptyMessage={t("dataExplorer.aiChatBookmarksEmpty")}
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
      </DialogContent>
    </Dialog>
  )
}
