import { useRef } from "react"
import {
  hideScrollbarClass,
  responseMessageBubbleClass,
  responseMessageRowClass,
} from "./ai-query-chat-message-styles"
import { type OpenAiModelPricing } from "../api"
import { AiQueryChatSqlActions } from "./ai-query-chat-sql-actions"
import { AiQueryChatUsageIcon } from "./ai-query-chat-usage-icon"
import {
  type AiQueryChatSqlApplyMeta,
  type AiQueryChatSqlMessage,
} from "../use-ai-query-chat"
import { useAutoScrollOnContentChange } from "./use-auto-scroll-on-content-change"
import type { SqlExplorerHistoryItem } from "../sql-explorer-history-storage"

export type AiQueryChatSqlMessageProps = {
  message: AiQueryChatSqlMessage
  isPending: boolean
  modelPricing?: OpenAiModelPricing
  onApplySql?: (sql: string, meta?: AiQueryChatSqlApplyMeta) => void
  onApplySqlAndRun?: (sql: string, meta?: AiQueryChatSqlApplyMeta) => void
  applySqlAndRunDisabled?: boolean
  isQueryRunning?: boolean
  historyItem?: SqlExplorerHistoryItem
  onToggleBookmark?: (item: SqlExplorerHistoryItem) => void
}

export function AiQueryChatSqlMessageView({
  message,
  isPending,
  modelPricing,
  onApplySql,
  onApplySqlAndRun,
  applySqlAndRunDisabled,
  isQueryRunning,
  historyItem,
  onToggleBookmark,
}: AiQueryChatSqlMessageProps) {
  const sqlTextRef = useRef<HTMLPreElement>(null)
  useAutoScrollOnContentChange(sqlTextRef, message.output, isPending)

  if (!message.output.trim()) return null
  const applyMeta: AiQueryChatSqlApplyMeta = {
    title: message.title,
    source: "ai",
  }

  return (
    <div className={responseMessageRowClass}>
      <div className={responseMessageBubbleClass}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{message.title || "SQL"}</p>
          </div>
          <AiQueryChatSqlActions
            sql={message.output}
            isPending={isPending}
            isQueryRunning={isQueryRunning}
            historyItem={historyItem}
            applyMeta={applyMeta}
            onApplySql={onApplySql}
            onApplySqlAndRun={onApplySqlAndRun}
            applySqlAndRunDisabled={applySqlAndRunDisabled}
            onToggleBookmark={onToggleBookmark}
          />
        </div>
        <pre
          ref={sqlTextRef}
          className={`max-h-48 overflow-auto text-xs font-mono whitespace-pre-wrap text-muted-foreground ${hideScrollbarClass}`}
        >
          {message.output}
        </pre>
        {!isPending ? (
          <div className="absolute bottom-1 right-1">
            <AiQueryChatUsageIcon usage={message.usage} modelPricing={modelPricing} compact />
          </div>
        ) : null}
      </div>
    </div>
  )
}
