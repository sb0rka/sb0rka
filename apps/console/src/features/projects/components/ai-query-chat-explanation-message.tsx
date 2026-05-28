import { useRef } from "react"
import { useTranslation } from "react-i18next"
import { useAutoScrollOnContentChange } from "./use-auto-scroll-on-content-change"
import { Check, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  EXPLAIN_STYLE_ORDER,
  explainStyleKeyFromPrompt,
  explainStyleLabelKey,
  explainStylePrompt,
} from "../explain-styles"
import { type AiQueryChatExplanationMessage } from "../use-ai-query-chat"
import { responseMessageBubbleClass, responseMessageRowClass } from "./ai-query-chat-message-styles"

export type AiQueryChatExplanationMessageProps = {
  message: AiQueryChatExplanationMessage
  index: number
  isPending: boolean
  onRefreshExplanationAt: (index: number, stylePrompt: string) => void | Promise<void>
}

export function AiQueryChatExplanationMessageView({
  message,
  index,
  isPending,
  onRefreshExplanationAt,
}: AiQueryChatExplanationMessageProps) {
  const { t } = useTranslation()
  const explanationTextRef = useRef<HTMLDivElement>(null)
  useAutoScrollOnContentChange(explanationTextRef, message.output, isPending)
  const styleKey = explainStyleKeyFromPrompt(message.style)
  const explanationChromeNone = styleKey === "none"
  const hasExplanationContent = message.output.trim().length > 0
  const explanationMenuKeys = explanationChromeNone
    ? EXPLAIN_STYLE_ORDER.filter((k) => k !== "none")
    : EXPLAIN_STYLE_ORDER

  return (
    <div
      className={hasExplanationContent ? responseMessageRowClass : "flex justify-end"}
    >
      <div className={hasExplanationContent ? responseMessageBubbleClass : undefined}>
        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            hasExplanationContent
              ? explanationChromeNone
                ? "justify-end"
                : "mb-2 justify-between"
              : "justify-end",
          )}
        >
          {hasExplanationContent && !explanationChromeNone ? (
            <p className="text-sm font-medium">{t("dataExplorer.aiChatAnalysisTitle")}</p>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                disabled={isPending}
                aria-label={t("dataExplorer.aiChatExplanationStyleMenu")}
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {explanationMenuKeys.map((key) => (
                <DropdownMenuItem
                  key={key}
                  className="gap-2"
                  disabled={isPending}
                  onSelect={() => {
                    const prompt = explainStylePrompt(key)
                    void onRefreshExplanationAt(index, prompt)
                  }}
                >
                  <span className="flex-1">{t(explainStyleLabelKey(key))}</span>
                  {styleKey === key ? (
                    <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {hasExplanationContent ? (
          <div
            ref={explanationTextRef}
            className="max-h-[420px] overflow-auto text-sm whitespace-pre-wrap text-muted-foreground"
          >
            {message.output}
          </div>
        ) : null}
      </div>
    </div>
  )
}
