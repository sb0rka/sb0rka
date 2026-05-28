import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { type AiQueryChatErrorMessage } from "../use-ai-query-chat"
import {
  errorMessageBubbleClass,
  responseMessageRowClass,
} from "./ai-query-chat-message-styles"

export type AiQueryChatErrorMessageProps = {
  message: AiQueryChatErrorMessage
  index: number
}

export function AiQueryChatErrorMessageView({ message, index }: AiQueryChatErrorMessageProps) {
  const { t } = useTranslation()

  return (
    <div className={cn(responseMessageRowClass, index > 0 && "mt-6")}>
      <div className={errorMessageBubbleClass} role="alert">
        <p className="mb-2 text-sm font-medium text-foreground">
          {t("dataExplorer.aiChatErrorTitle")}
        </p>
        <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
          {message.output}
        </p>
      </div>
    </div>
  )
}
