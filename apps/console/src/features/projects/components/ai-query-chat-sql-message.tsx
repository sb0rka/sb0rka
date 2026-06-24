import { useRef } from "react"
import {
  hideScrollbarClass,
  responseMessageBubbleClass,
  responseMessageRowClass,
} from "./ai-query-chat-message-styles"
import { type OpenAiModelPricing } from "../api"
import { AiQueryChatSqlActions } from "./ai-query-chat-sql-actions"
import { AiQueryChatUsageIcon } from "./ai-query-chat-usage-icon"
import { type AiQueryChatSqlMessage } from "../use-ai-query-chat"
import { useAutoScrollOnContentChange } from "./use-auto-scroll-on-content-change"

export type AiQueryChatSqlMessageProps = {
  message: AiQueryChatSqlMessage
  isPending: boolean
  modelPricing?: OpenAiModelPricing
  onApplySql?: (sql: string) => void
  onApplySqlAndRun?: (sql: string) => void
  applySqlAndRunDisabled?: boolean
}

export function AiQueryChatSqlMessageView({
  message,
  isPending,
  modelPricing,
  onApplySql,
  onApplySqlAndRun,
  applySqlAndRunDisabled,
}: AiQueryChatSqlMessageProps) {
  const sqlTextRef = useRef<HTMLPreElement>(null)
  useAutoScrollOnContentChange(sqlTextRef, message.output, isPending)

  if (!message.output.trim()) return null

  return (
    <div className={responseMessageRowClass}>
      <div className={responseMessageBubbleClass}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">SQL</p>
          <AiQueryChatSqlActions
            sql={message.output}
            isPending={isPending}
            onApplySql={onApplySql}
            onApplySqlAndRun={onApplySqlAndRun}
            applySqlAndRunDisabled={applySqlAndRunDisabled}
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
