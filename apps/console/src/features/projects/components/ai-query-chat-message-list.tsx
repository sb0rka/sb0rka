import { useMemo, useRef } from "react"
import { type OpenAiModelPricing } from "../api"
import {
  type AiQueryChatMessage,
  type AiQueryChatSqlApplyMeta,
} from "../use-ai-query-chat"
import { AiQueryChatMessageItem } from "./ai-query-chat-message-item"
import { hideScrollbarClass } from "./ai-query-chat-message-styles"
import {
  messagesAutoScrollKey,
  useAutoScrollOnContentChange,
} from "./use-auto-scroll-on-content-change"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { SqlExplorerHistoryItem } from "../sql-explorer-history-storage"

export type AiQueryChatMessageListProps = {
  messages: AiQueryChatMessage[]
  isPending: boolean
  modelPricing?: OpenAiModelPricing
  onApplySql?: (sql: string, meta?: AiQueryChatSqlApplyMeta) => void
  onApplySqlAndRun?: (sql: string, meta?: AiQueryChatSqlApplyMeta) => void
  applySqlAndRunDisabled?: boolean
  isQueryRunning?: boolean
  historyItems?: SqlExplorerHistoryItem[]
  onToggleBookmark?: (item: SqlExplorerHistoryItem) => void
}

export function AiQueryChatMessageList({
  messages,
  isPending,
  modelPricing,
  onApplySql,
  onApplySqlAndRun,
  applySqlAndRunDisabled,
  isQueryRunning,
  historyItems = [],
  onToggleBookmark,
}: AiQueryChatMessageListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const scrollKey = useMemo(() => messagesAutoScrollKey(messages), [messages])
  const lastThinkingIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role === "assistant" && m.type === "thinking") return i
    }
    return -1
  }, [messages])

  useAutoScrollOnContentChange(listRef, scrollKey, messages.length > 0, [isPending], {
    resetWhen: isPending,
  })
  return (
    <ScrollArea
      viewportRef={listRef}
      type="always"
      className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]]:overscroll-y-contain"
    >
      <div
        className={`flex flex-col gap-3 pr-1 ${hideScrollbarClass}`}
      >
        {messages.map((message, index) => {
          const historyItem =
            message.role === "assistant" && message.type === "sql"
              ? historyItems.find((item) => item.sql.trim() === message.output.trim())
              : undefined
          return (
            <AiQueryChatMessageItem
              key={index}
              message={message}
              index={index}
              isPending={isPending}
              isActiveThinking={
                isPending &&
                message.role === "assistant" &&
                message.type === "thinking" &&
                index === lastThinkingIndex
              }
              modelPricing={modelPricing}
              onApplySql={onApplySql}
              onApplySqlAndRun={onApplySqlAndRun}
              applySqlAndRunDisabled={applySqlAndRunDisabled}
              isQueryRunning={isQueryRunning}
              historyItem={historyItem}
              onToggleBookmark={onToggleBookmark}
            />
          )
        })}
      </div>
    </ScrollArea>
  )
}
