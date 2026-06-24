import { type OpenAiModelPricing } from "../api"
import { type AiQueryChatMessage } from "../use-ai-query-chat"
import { AiQueryChatAssistantFixMessageView } from "./ai-query-chat-assistant-fix-message"
import { AiQueryChatErrorMessageView } from "./ai-query-chat-error-message"
import { AiQueryChatSqlMessageView } from "./ai-query-chat-sql-message"
import { AiQueryChatThinkingMessageView } from "./ai-query-chat-thinking-message"
import { AiQueryChatUserFixMessageView } from "./ai-query-chat-user-fix-message"
import { AiQueryChatUserTextMessageView } from "./ai-query-chat-user-text-message"

export type AiQueryChatMessageItemProps = {
  message: AiQueryChatMessage
  index: number
  isPending: boolean
  isActiveThinking: boolean
  modelPricing?: OpenAiModelPricing
  onApplySql?: (sql: string) => void
  onApplySqlAndRun?: (sql: string) => void
  applySqlAndRunDisabled?: boolean
}

export function AiQueryChatMessageItem({
  message,
  index,
  isPending,
  isActiveThinking,
  modelPricing,
  onApplySql,
  onApplySqlAndRun,
  applySqlAndRunDisabled,
}: AiQueryChatMessageItemProps) {
  if (message.role === "user") {
    if (message.variant === "fix") {
      return <AiQueryChatUserFixMessageView message={message} index={index} />
    }
    return <AiQueryChatUserTextMessageView message={message} index={index} />
  }

  if (message.type === "thinking") {
    return <AiQueryChatThinkingMessageView message={message} isActive={isActiveThinking} />
  }

  if (message.type === "sql") {
    return (
      <AiQueryChatSqlMessageView
        message={message}
        isPending={isPending}
        modelPricing={modelPricing}
        onApplySql={onApplySql}
        onApplySqlAndRun={onApplySqlAndRun}
        applySqlAndRunDisabled={applySqlAndRunDisabled}
      />
    )
  }

  if (message.type === "fix") {
    return (
      <AiQueryChatAssistantFixMessageView
        message={message}
        index={index}
        isPending={isPending}
        modelPricing={modelPricing}
      />
    )
  }

  if (message.type === "error") {
    return <AiQueryChatErrorMessageView message={message} index={index} />
  }

  return null
}
