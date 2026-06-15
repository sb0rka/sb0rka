import { useMemo, useRef } from "react"
import { type AiQueryChatMessage } from "../use-ai-query-chat"
import { AiQueryChatMessageItem } from "./ai-query-chat-message-item"
import {
  messagesAutoScrollKey,
  useAutoScrollOnContentChange,
} from "./use-auto-scroll-on-content-change"
import { ScrollArea } from "@/components/ui/scroll-area"

export type AiQueryChatMessageListProps = {
  messages: AiQueryChatMessage[]
  isPending: boolean
  onApplySql?: (sql: string) => void
  onApplySqlAndRun?: (sql: string) => void
  applySqlAndRunDisabled?: boolean
  onRefreshExplanationAt: (index: number, stylePrompt: string) => void | Promise<void>
}

export function AiQueryChatMessageList({
  messages,
  isPending,
  onApplySql,
  onApplySqlAndRun,
  applySqlAndRunDisabled,
  onRefreshExplanationAt,
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



  // console.log(messages)

  return (
    <ScrollArea
      viewportRef={listRef}
      type="always"
      className="min-h-0 flex-1 w-full rounded-md border border-border/80 bg-background"
    >
      <div
        className="flex flex-col gap-3 pr-4"
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
            onRefreshExplanationAt={onRefreshExplanationAt}
          />
        ))}
      </div>
    </ScrollArea>
  )
}
