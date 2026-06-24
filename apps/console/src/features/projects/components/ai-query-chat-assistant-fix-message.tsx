import { useRef } from "react"
import { useTranslation } from "react-i18next"
import { useAutoScrollOnContentChange } from "./use-auto-scroll-on-content-change"
import { cn } from "@/lib/utils"
import {
  hideScrollbarClass,
  responseMessageBubbleClass,
  responseMessageRowClass,
} from "./ai-query-chat-message-styles"
import { type OpenAiModelPricing } from "../api"
import { AiQueryChatUsageIcon } from "./ai-query-chat-usage-icon"
import { type AiQueryChatFixMessage } from "../use-ai-query-chat"

export type AiQueryChatAssistantFixMessageProps = {
  message: AiQueryChatFixMessage
  index: number
  isPending: boolean
  modelPricing?: OpenAiModelPricing
}

export function AiQueryChatAssistantFixMessageView({
  message,
  index,
  isPending,
  modelPricing,
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
              className={`max-h-[280px] overflow-auto text-sm whitespace-pre-wrap text-muted-foreground ${hideScrollbarClass}`}
            >
              {message.explanation}
            </div>
            {!isPending ? (
              <div className="absolute bottom-1 right-1">
                <AiQueryChatUsageIcon usage={message.usage} modelPricing={modelPricing} compact />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
