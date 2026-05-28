import { cn } from "@/lib/utils"
import { type AiQueryChatUserTextMessage } from "../use-ai-query-chat"
import { userMessageBubbleClass } from "./ai-query-chat-message-styles"

export type AiQueryChatUserTextMessageProps = {
  message: AiQueryChatUserTextMessage
  index: number
}

export function AiQueryChatUserTextMessageView({
  message,
  index,
}: AiQueryChatUserTextMessageProps) {
  return (
    <div className={cn("flex justify-end pr-3", index > 0 && "mt-6")}>
      <div className={userMessageBubbleClass}>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{message.content}</p>
      </div>
    </div>
  )
}
