import { useMemo, useRef } from "react"
import { type AiQueryChatMessage } from "../use-ai-query-chat"
import { AiQueryChatMessageItem } from "./ai-query-chat-message-item"
import { hideScrollbarClass } from "./ai-query-chat-message-styles"
import {
  messagesAutoScrollKey,
  useAutoScrollOnContentChange,
} from "./use-auto-scroll-on-content-change"

export type AiQueryChatMessageListProps = {
  messages: AiQueryChatMessage[]
  isPending: boolean
  onApplySql?: (sql: string) => void
  onApplySqlAndRun?: (sql: string) => void
  applySqlAndRunDisabled?: boolean
}

export function AiQueryChatMessageList({
  messages,
  isPending,
  onApplySql,
  onApplySqlAndRun,
  applySqlAndRunDisabled,
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
    <div
      ref={listRef}
      className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden pr-1 ${hideScrollbarClass}`}
    >
      {messages.map((message, index) => (
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
          onApplySql={onApplySql}
          onApplySqlAndRun={onApplySqlAndRun}
          applySqlAndRunDisabled={applySqlAndRunDisabled}
        />
      ))}
    </div>
  )
}
