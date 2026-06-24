import { useTranslation } from "react-i18next"
import { CircleDollarSign } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  estimateUsageCostUsd,
  type OpenAiModelPricing,
  type OpenAiRequestUsage,
} from "../api"

function formatCostUsd(cost: number): string {
  if (cost === 0) return "free"
  if (cost < 0.0001) return `$${cost.toFixed(6)}`
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(3)}`
}

function formatPricePerMillionTokens(value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return "-"
  if (n < 0) return "~"
  const perMillion = n * 1_000_000
  if (perMillion === 0) return "$0"
  let formatted: string
  if (perMillion >= 100) formatted = perMillion.toFixed(2)
  else if (perMillion >= 1) formatted = perMillion.toFixed(3)
  else if (perMillion >= 0.01) formatted = perMillion.toFixed(4)
  else formatted = perMillion.toFixed(6)
  return `$${formatted}`
}

function formatInputTokensLine(usage: OpenAiRequestUsage): string {
  const cached = usage.cachedInputTokens ?? 0
  if (cached <= 0) {
    return `${usage.inputTokens.toLocaleString()} in`
  }
  const totalIn = cached > usage.inputTokens ? usage.inputTokens + cached : usage.inputTokens
  return `${totalIn.toLocaleString()} in (${cached.toLocaleString()} cached)`
}

function formatOutputTokensLine(usage: OpenAiRequestUsage): string {
  const output = usage.outputTokens.toLocaleString()
  if (usage.reasoningTokens !== undefined && usage.reasoningTokens > 0) {
    return `${output} out (${usage.reasoningTokens.toLocaleString()} reasoning)`
  }
  return `${output} out`
}

function formatCostCalculationLine(
  usage: OpenAiRequestUsage,
  pricing: OpenAiModelPricing,
  costUsd: number,
): string {
  const inPrice = formatPricePerMillionTokens(pricing.prompt)
  const outPrice = formatPricePerMillionTokens(pricing.completion)
  return `${usage.inputTokens.toLocaleString()} × ${inPrice}/1M + ${usage.outputTokens.toLocaleString()} × ${outPrice}/1M = ${formatCostUsd(costUsd)}`
}

export function formatAiChatUsageTooltip(
  usage: OpenAiRequestUsage,
  pricing: OpenAiModelPricing | undefined,
): string {
  const lines = [formatInputTokensLine(usage), formatOutputTokensLine(usage)]

  const costUsd = estimateUsageCostUsd(usage, pricing)
  if (costUsd !== null && pricing) {
    lines.push(formatCostCalculationLine(usage, pricing, costUsd))
  } else if (costUsd !== null) {
    lines.push(formatCostUsd(costUsd))
  }

  return lines.join("\n")
}

export type AiQueryChatUsageIconProps = {
  usage?: OpenAiRequestUsage
  modelPricing?: OpenAiModelPricing
  disabled?: boolean
  compact?: boolean
}

export function AiQueryChatUsageIcon({
  usage,
  modelPricing,
  disabled = false,
  compact = false,
}: AiQueryChatUsageIconProps) {
  const { t } = useTranslation()

  if (!usage) return null

  const tooltipText = formatAiChatUsageTooltip(usage, modelPricing)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground",
            compact ? "h-6 w-6" : "h-8 w-8",
          )}
          disabled={disabled}
          aria-label={t("dataExplorer.aiChatUsageTitle")}
        >
          <CircleDollarSign className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </Button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        className="max-w-none whitespace-pre-line text-xs tabular-nums"
      >
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  )
}
