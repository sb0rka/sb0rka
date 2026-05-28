import { type AiQueryChatMessage } from "../use-ai-query-chat"
import { AiQueryChatAssistantFixMessageView } from "./ai-query-chat-assistant-fix-message"
import { AiQueryChatErrorMessageView } from "./ai-query-chat-error-message"
import { AiQueryChatExplanationMessageView } from "./ai-query-chat-explanation-message"
import { AiQueryChatSqlMessageView } from "./ai-query-chat-sql-message"
import { AiQueryChatThinkingMessageView } from "./ai-query-chat-thinking-message"
import { AiQueryChatUserFixMessageView } from "./ai-query-chat-user-fix-message"
import { AiQueryChatUserTextMessageView } from "./ai-query-chat-user-text-message"

export type AiQueryChatMessageItemProps = {
  message: AiQueryChatMessage
  index: number
  isPending: boolean
  isActiveThinking: boolean
  onApplySql?: (sql: string) => void
  onApplySqlAndRun?: (sql: string) => void
  applySqlAndRunDisabled?: boolean
  onRefreshExplanationAt: (index: number, stylePrompt: string) => void | Promise<void>
}

export function AiQueryChatMessageItem({
  message,
  index,
  isPending,
  isActiveThinking,
  onApplySql,
  onApplySqlAndRun,
  applySqlAndRunDisabled,
  onRefreshExplanationAt,
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
      />
    )
  }

  if (message.type === "error") {
    return <AiQueryChatErrorMessageView message={message} index={index} />
  }

  return (
    <AiQueryChatExplanationMessageView
      message={message}
      index={index}
      isPending={isPending}
      onRefreshExplanationAt={onRefreshExplanationAt}
    />
  )
}
