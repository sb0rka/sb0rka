import { useRef } from "react"
import { useTranslation } from "react-i18next"
import { useAutoScrollOnContentChange } from "./use-auto-scroll-on-content-change"
import { cn } from "@/lib/utils"
import {
  responseMessageBubbleClass,
  responseMessageRowClass,
} from "./ai-query-chat-message-styles"
import { type AiQueryChatFixMessage } from "../use-ai-query-chat"

export type AiQueryChatAssistantFixMessageProps = {
  message: AiQueryChatFixMessage
  index: number
  isPending: boolean
}

export function AiQueryChatAssistantFixMessageView({
  message,
  index,
  isPending,
}: AiQueryChatAssistantFixMessageProps) {
  const { t } = useTranslation()
  const explanationTextRef = useRef<HTMLDivElement>(null)
  const hasExplanation = message.explanation.trim().length > 0
  useAutoScrollOnContentChange(explanationTextRef, message.explanation, isPending)

  if (!hasExplanation) return null

  return (
    <div className={cn("space-y-3", index > 0 && "mt-6")}>
      {hasExplanation ? (
        <div className={responseMessageRowClass}>
          <div className={responseMessageBubbleClass}>
            <p className="mb-2 text-sm font-medium">{t("dataExplorer.fixDiagnosisTitle")}</p>
            <div
              ref={explanationTextRef}
              className="max-h-[280px] overflow-auto text-sm whitespace-pre-wrap text-muted-foreground"
            >
              {message.explanation}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
