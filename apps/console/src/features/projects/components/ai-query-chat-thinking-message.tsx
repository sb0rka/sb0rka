import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { useAutoScrollOnContentChange } from "./use-auto-scroll-on-content-change"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { type AiQueryChatThinkingMessage } from "../use-ai-query-chat"
import {
  hideScrollbarClass,
  responseMessageBubbleClass,
  responseMessageRowClass,
} from "./ai-query-chat-message-styles"

export type AiQueryChatThinkingMessageViewProps = {
  message: AiQueryChatThinkingMessage
  isActive: boolean
}

export function AiQueryChatThinkingMessageView({
  message,
  isActive,
}: AiQueryChatThinkingMessageViewProps) {
  const { t } = useTranslation()
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false)
  const thinkingTextRef = useRef<HTMLDivElement>(null)
  const hasThinkingText = message.output.trim().length > 0
  const isThinkingExpandable = useMemo(() => {
    if (!hasThinkingText) return false
    return message.output.split(/\r?\n/).length > 3 || message.output.length > 240
  }, [hasThinkingText, message.output])

  useAutoScrollOnContentChange(thinkingTextRef, message.output, isActive, [isThinkingExpanded])

  useEffect(() => {
    if (!isActive) return
    setIsThinkingExpanded(false)
  }, [isActive])

  if (!hasThinkingText) return null

  return (
    <div className={cn(responseMessageRowClass, "w-full")}>
      <div
        className={cn(responseMessageBubbleClass, "w-full max-w-[90%]")}
        aria-live={isActive ? "polite" : undefined}
        aria-busy={isActive ? "true" : undefined}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            {isActive
              ? t("dataExplorer.aiChatThinking")
              : t("dataExplorer.aiChatThinkingTitle")}
          </p>
          {isThinkingExpandable ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              aria-expanded={isThinkingExpanded}
              aria-label={
                isThinkingExpanded
                  ? t("dataExplorer.aiChatThinkingCollapse")
                  : t("dataExplorer.aiChatThinkingExpand")
              }
              onClick={() => setIsThinkingExpanded((prev) => !prev)}
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform",
                  isThinkingExpanded && "rotate-180",
                )}
              />
            </Button>
          ) : null}
        </div>
        <div className="min-w-0">
          <div
            ref={thinkingTextRef}
            className={cn(
              "text-sm whitespace-pre-wrap break-words leading-5 text-muted-foreground",
              isThinkingExpanded
                ? "max-h-[400px] overflow-auto"
                : "min-h-[200px] max-h-[200px] overflow-auto",
              hideScrollbarClass,
            )}
          >
            {message.output}
          </div>
        </div>
      </div>
    </div>
  )
}
