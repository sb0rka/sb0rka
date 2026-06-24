import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { ArrowUpDown, Check, ChevronDown, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { type OpenAiModelInfo, type OpenAiModelPricing } from "../api"

function toMicroDollarString(value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return "-"
  return `${(n * 1_000_000).toFixed(3)}u`
}

function isVariableModelPricing(pricing: OpenAiModelPricing | undefined): boolean {
  if (!pricing) return false
  const prompt = Number(pricing.prompt)
  return Number.isFinite(prompt) && prompt < 0
}

function modelPromptPrice(pricing: OpenAiModelPricing | undefined): number | null {
  if (!pricing || isVariableModelPricing(pricing)) return null
  const prompt = Number(pricing.prompt)
  if (!Number.isFinite(prompt)) return null
  return prompt
}

type ModelSortKey = "id" | "name" | "priceAsc" | "priceDesc"

const MODEL_SORT_OPTIONS: readonly ModelSortKey[] = [
  "name",
  "id",
  "priceAsc",
  "priceDesc",
] as const

function compareModelsByPrice(
  a: OpenAiModelInfo,
  b: OpenAiModelInfo,
  direction: "asc" | "desc",
): number {
  const pa = modelPromptPrice(a.pricing)
  const pb = modelPromptPrice(b.pricing)
  if (pa === null && pb === null) return a.id.localeCompare(b.id)
  if (pa === null) return 1
  if (pb === null) return -1
  const diff = pa - pb
  if (diff !== 0) return direction === "asc" ? diff : -diff
  return a.id.localeCompare(b.id)
}

function modelSortLabelKey(key: ModelSortKey): string {
  switch (key) {
    case "name":
      return "dataExplorer.aiChatMenuSortByName"
    case "id":
      return "dataExplorer.aiChatMenuSortById"
    case "priceAsc":
      return "dataExplorer.aiChatMenuSortByPriceAsc"
    case "priceDesc":
      return "dataExplorer.aiChatMenuSortByPriceDesc"
    default: {
      const _x: never = key
      return _x
    }
  }
}

function scrollElementIntoScrollParent(container: HTMLElement, element: HTMLElement): void {
  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const relativeTop = elementRect.top - containerRect.top + container.scrollTop
  const relativeBottom = relativeTop + elementRect.height
  const viewTop = container.scrollTop
  const viewBottom = viewTop + container.clientHeight

  if (relativeTop < viewTop) {
    container.scrollTop = relativeTop
  } else if (relativeBottom > viewBottom) {
    container.scrollTop = relativeBottom - container.clientHeight
  }
}

function pricingRateIndicator(
  pricing: OpenAiModelPricing | undefined,
  field: "prompt" | "completion",
): string {
  if (!pricing) return "-"
  if (isVariableModelPricing(pricing)) return "~"
  const raw = pricing[field]
  const n = Number(raw)
  if (!Number.isFinite(n)) return "-"
  if (n === 0) return "free"
  if (n < 0) return "~"
  return toMicroDollarString(raw)
}

const modelPriceColumnClass = "w-10 shrink-0 text-right tabular-nums"

function formatTooltipPricePerMillionTokens(value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return "-"
  if (n < 0) return "~"
  const perMillion = n * 1_000_000
  if (perMillion === 0) return "0"
  let formatted: string
  if (perMillion >= 100) formatted = perMillion.toFixed(2)
  else if (perMillion >= 1) formatted = perMillion.toFixed(3)
  else if (perMillion >= 0.01) formatted = perMillion.toFixed(4)
  else formatted = perMillion.toFixed(6)
  return `$${formatted}`
}

function pricingHoverText(
  modelId: string,
  pricing: OpenAiModelPricing | undefined,
  t: TFunction,
): string {
  if (!pricing) return modelId
  const lines = [modelId, ""]
  if (isVariableModelPricing(pricing)) {
    lines.push(t("dataExplorer.aiChatMenuPricingVariable"))
  } else {
    lines.push(
      t("dataExplorer.aiChatMenuPricingInput", {
        value: formatTooltipPricePerMillionTokens(pricing.prompt),
      }),
    )
    lines.push(
      t("dataExplorer.aiChatMenuPricingOutput", {
        value: formatTooltipPricePerMillionTokens(pricing.completion),
      }),
    )
  }
  if (pricing.input_cache_read) {
    lines.push(
      t("dataExplorer.aiChatMenuPricingCacheRead", {
        value: formatTooltipPricePerMillionTokens(pricing.input_cache_read),
      }),
    )
  }
  return lines.join("\n")
}

function hasModelCatalogPricing(models: OpenAiModelInfo[]): boolean {
  return models.some((model) => model.pricing !== undefined)
}

const aiChatMenuTriggerClass =
  "focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"

export type AiQueryChatModelSelectorProps = {
  availableModels: OpenAiModelInfo[]
  selectedModel: string
  modelsLoading?: boolean
  modelsRefreshing?: boolean
  modelsError?: boolean
  onModelSelect?: (model: string) => void
  onRefreshModels?: () => void
}

export function AiQueryChatModelSelector({
  availableModels,
  selectedModel,
  modelsLoading,
  modelsRefreshing,
  modelsError,
  onModelSelect,
  onRefreshModels,
}: AiQueryChatModelSelectorProps) {
  const { t } = useTranslation()
  const [modelFilter, setModelFilter] = useState("")
  const [modelSort, setModelSort] = useState<ModelSortKey>("priceAsc")
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const modelListScrollRef = useRef<HTMLDivElement>(null)
  const selectedModelItemRef = useRef<HTMLDivElement>(null)

  const showPricingColumns = useMemo(
    () => hasModelCatalogPricing(availableModels),
    [availableModels],
  )

  const sortOptions = useMemo(
    () =>
      showPricingColumns
        ? MODEL_SORT_OPTIONS
        : MODEL_SORT_OPTIONS.filter((key) => key !== "priceAsc" && key !== "priceDesc"),
    [showPricingColumns],
  )

  const filteredModels = useMemo(() => {
    const q = modelFilter.trim().toLowerCase()
    const filtered = availableModels.filter((model) =>
      model.id.toLowerCase().includes(q),
    )
    if (modelSort === "id") return filtered
    const sorted = [...filtered]
    if (modelSort === "name") {
      sorted.sort((a, b) => a.id.localeCompare(b.id))
    } else if (showPricingColumns) {
      sorted.sort((a, b) =>
        compareModelsByPrice(a, b, modelSort === "priceAsc" ? "asc" : "desc"),
      )
    }
    return sorted
  }, [availableModels, modelFilter, modelSort, showPricingColumns])

  useEffect(() => {
    if (showPricingColumns) return
    if (modelSort === "priceAsc" || modelSort === "priceDesc") {
      setModelSort("name")
    }
  }, [showPricingColumns, modelSort])

  const scrollSelectedModelIntoView = useCallback(() => {
    const container = modelListScrollRef.current
    if (!container) return false
    const item =
      selectedModelItemRef.current ??
      container.querySelector<HTMLElement>('[data-model-selected="true"]')
    if (!item) return false
    scrollElementIntoScrollParent(container, item)
    return true
  }, [])

  const handleModelMenuOpenChange = useCallback(
    (open: boolean) => {
      setModelMenuOpen(open)
      if (!open) return
      const run = () => scrollSelectedModelIntoView()
      requestAnimationFrame(() => {
        if (!run()) requestAnimationFrame(run)
      })
    },
    [scrollSelectedModelIntoView],
  )

  useEffect(() => {
    if (!modelMenuOpen || modelsLoading) return
    const run = () => scrollSelectedModelIntoView()
    const id = requestAnimationFrame(() => {
      if (!run()) requestAnimationFrame(run)
    })
    return () => cancelAnimationFrame(id)
  }, [
    modelMenuOpen,
    modelsLoading,
    filteredModels,
    selectedModel,
    scrollSelectedModelIntoView,
  ])

  return (
    <DropdownMenu open={modelMenuOpen} onOpenChange={handleModelMenuOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-9 w-full gap-1 rounded-md border border-border/60 bg-muted/20 px-2 text-xs text-muted-foreground hover:bg-muted/35 hover:text-foreground",
            aiChatMenuTriggerClass,
          )}
          aria-label={t("dataExplorer.aiChatMenuGroupModel")}
        >
          <span className="min-w-0 flex-1 truncate text-left text-foreground">{selectedModel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="flex w-[var(--radix-dropdown-menu-trigger-width)] max-h-[min(70vh,32rem)] flex-col overflow-hidden p-0"
      >
        <div className="flex shrink-0 items-center gap-1 border-b border-border p-1">
          <div className="relative min-w-0 flex-1">
            <Input
              value={modelFilter}
              onChange={(event) => setModelFilter(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder={t("dataExplorer.aiChatMenuFilterModels")}
              className="h-8 w-full pr-8"
            />
            {modelFilter.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "absolute right-0 top-0 h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground",
                  aiChatMenuTriggerClass,
                )}
                aria-label={t("dataExplorer.aiChatMenuClearFilter")}
                title={t("dataExplorer.aiChatMenuClearFilter")}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setModelFilter("")
                }}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 shrink-0 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              aiChatMenuTriggerClass,
            )}
            disabled={modelsLoading || !onRefreshModels}
            aria-label={t("dataExplorer.aiChatMenuRefreshModels")}
            title={t("dataExplorer.aiChatMenuRefreshModels")}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onRefreshModels?.()
            }}
          >
            <RefreshCw
              className={cn("h-4 w-4", modelsRefreshing && "animate-spin")}
              aria-hidden
            />
          </Button>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 shrink-0 text-muted-foreground hover:bg-muted/50 hover:text-foreground data-[state=open]:bg-muted/50 data-[state=open]:text-foreground",
                  aiChatMenuTriggerClass,
                )}
                aria-label={t("dataExplorer.aiChatMenuSortLabel")}
                title={t("dataExplorer.aiChatMenuSortLabel")}
              >
                <ArrowUpDown className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {sortOptions.map((key) => (
                <DropdownMenuItem
                  key={key}
                  className="gap-2"
                  onSelect={(event) => {
                    event.preventDefault()
                    setModelSort(key)
                  }}
                >
                  <span className="flex-1">{t(modelSortLabelKey(key))}</span>
                  {modelSort === key ? (
                    <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </div>
        {showPricingColumns ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1 text-[10px] text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">{t("dataExplorer.aiChatMenuPriceColumnName")}</span>
            <span
              className={modelPriceColumnClass}
              title={t("dataExplorer.aiChatMenuPriceColumnInTitle")}
            >
              {t("dataExplorer.aiChatMenuPriceColumnIn")}
            </span>
            <span
              className={modelPriceColumnClass}
              title={t("dataExplorer.aiChatMenuPriceColumnOutTitle")}
            >
              {t("dataExplorer.aiChatMenuPriceColumnOut")}
            </span>
          </div>
        ) : null}
        <div
          ref={modelListScrollRef}
          className="h-0 min-h-0 flex-1 overflow-y-auto px-1 pb-1"
        >
          {modelsLoading ? (
            <DropdownMenuItem disabled className="w-full">
              {t("dataExplorer.aiChatMenuModelsLoading")}
            </DropdownMenuItem>
          ) : null}
          {!modelsLoading && modelsError ? (
            <DropdownMenuItem disabled className="w-full">
              {t("dataExplorer.aiChatMenuModelsFallback")}
            </DropdownMenuItem>
          ) : null}
          {!modelsLoading && availableModels.length === 0 ? (
            <DropdownMenuItem disabled className="w-full">
              {t("dataExplorer.aiChatMenuModelsEmpty")}
            </DropdownMenuItem>
          ) : null}
          {!modelsLoading && availableModels.length > 0 && filteredModels.length === 0 ? (
            <DropdownMenuItem disabled className="w-full">
              {t("dataExplorer.aiChatMenuModelsNotFound")}
            </DropdownMenuItem>
          ) : null}
          {!modelsLoading
            ? filteredModels.map((model) => {
                const { id: modelId, pricing } = model
                return (
                  <DropdownMenuItem
                    key={modelId}
                    ref={selectedModel === modelId ? selectedModelItemRef : undefined}
                    className={cn(
                      "w-full gap-2",
                      selectedModel === modelId && "bg-accent font-medium text-accent-foreground",
                    )}
                    data-model-selected={
                      selectedModel === modelId ? "true" : undefined
                    }
                    aria-current={selectedModel === modelId ? "true" : undefined}
                    onSelect={() => onModelSelect?.(modelId)}
                  >
                    <span className="min-w-0 flex-1 truncate">{modelId}</span>
                    {showPricingColumns ? (
                      <span className="group/price relative flex shrink-0 items-center gap-2">
                        <span className={cn(modelPriceColumnClass, "text-[10px] text-muted-foreground")}>
                          {pricingRateIndicator(pricing, "prompt")}
                        </span>
                        <span className={cn(modelPriceColumnClass, "text-[10px] text-muted-foreground")}>
                          {pricingRateIndicator(pricing, "completion")}
                        </span>
                        <span className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden w-56 whitespace-pre-wrap rounded border border-border bg-popover p-2 text-[10px] leading-relaxed text-popover-foreground shadow-md group-hover/price:block">
                          {pricingHoverText(modelId, pricing, t)}
                        </span>
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                )
              })
            : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
