import { useTranslation } from "react-i18next"
import { ClipboardPaste, Copy, Loader2, Play, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AiQueryChatSqlApplyMeta } from "../use-ai-query-chat"
import type { SqlExplorerHistoryItem } from "../sql-explorer-history-storage"

export type AiQueryChatSqlActionsProps = {
  sql: string
  isPending: boolean
  isQueryRunning?: boolean
  historyItem?: SqlExplorerHistoryItem
  applyMeta?: AiQueryChatSqlApplyMeta
  onApplySql?: (sql: string, meta?: AiQueryChatSqlApplyMeta) => void
  onApplySqlAndRun?: (sql: string, meta?: AiQueryChatSqlApplyMeta) => void
  applySqlAndRunDisabled?: boolean
  onToggleBookmark?: (item: SqlExplorerHistoryItem) => void
}

async function copySql(sql: string) {
  try {
    await navigator.clipboard.writeText(sql)
  } catch {
    // ignore
  }
}

export function AiQueryChatSqlActions({
  sql,
  isPending,
  isQueryRunning = false,
  historyItem,
  applyMeta,
  onApplySql,
  onApplySqlAndRun,
  applySqlAndRunDisabled,
  onToggleBookmark,
}: AiQueryChatSqlActionsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
        disabled={isPending}
        onClick={() => void copySql(sql)}
        aria-label={t("dataExplorer.aiChatCopySql")}
      >
        <Copy className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
        disabled={isPending || !onApplySql}
        onClick={() => onApplySql?.(sql, applyMeta)}
        aria-label={t("dataExplorer.aiChatApplySql")}
      >
        <ClipboardPaste className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground",
          isQueryRunning && "animate-pulse text-primary disabled:opacity-100",
        )}
        disabled={
          isPending ||
          !onApplySqlAndRun ||
          Boolean(applySqlAndRunDisabled) ||
          sql.trim().length === 0
        }
        onClick={() => onApplySqlAndRun?.(sql, applyMeta)}
        aria-label={
          isQueryRunning ? t("databaseQuery.running") : t("dataExplorer.aiChatApplySqlAndRun")
        }
      >
        {isQueryRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>
      {historyItem ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground",
            historyItem.bookmarked && "text-primary",
          )}
          disabled={isPending || !onToggleBookmark}
          onClick={() => onToggleBookmark?.(historyItem)}
          aria-label={
            historyItem.bookmarked
              ? t("dataExplorer.aiChatUnbookmarkSql")
              : t("dataExplorer.aiChatBookmarkSql")
          }
        >
          <Star className={cn("h-4 w-4", historyItem.bookmarked && "fill-current")} />
        </Button>
      ) : null}
    </div>
  )
}
