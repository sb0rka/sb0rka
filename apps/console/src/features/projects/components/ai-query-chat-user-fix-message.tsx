import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { type AiQueryChatUserFixMessage } from "../use-ai-query-chat"
import { hideScrollbarClass, userMessageBubbleClass } from "./ai-query-chat-message-styles"

export type AiQueryChatUserFixMessageProps = {
  message: AiQueryChatUserFixMessage
  index: number
}

export function AiQueryChatUserFixMessageView({
  message,
  index,
}: AiQueryChatUserFixMessageProps) {
  const { t } = useTranslation()

  return (
    <div className={cn("flex justify-end pr-3", index > 0 && "mt-6")}>
      <div className={cn(userMessageBubbleClass, "space-y-2")}>
        <p className="text-xs font-medium text-muted-foreground">
          {t("dataExplorer.fixChatSqlLabel")}
        </p>
        <pre
          className={`max-h-40 overflow-auto rounded-md border border-border/60 bg-muted/20 p-2 text-xs font-mono whitespace-pre-wrap ${hideScrollbarClass}`}
        >
          {message.sql}
        </pre>
        <p className="pt-1 text-xs font-medium text-muted-foreground">
          {t("dataExplorer.fixChatErrorLabel")}
        </p>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{message.errorMessage}</p>
      </div>
    </div>
  )
}
