import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowUpDown, Check, ChevronDown } from "lucide-react"
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

function modelTotalPrice(pricing: OpenAiModelPricing | undefined): number | null {
  if (!pricing) return null
  const prompt = Number(pricing.prompt)
  const completion = Number(pricing.completion)
  if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return null
  return prompt + completion
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
  const pa = modelTotalPrice(a.pricing)
  const pb = modelTotalPrice(b.pricing)
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

function pricingIndicator(pricing: OpenAiModelPricing | undefined): string {
  if (!pricing) return "-"
  const prompt = Number(pricing.prompt)
  const completion = Number(pricing.completion)
  if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return "-"
  return toMicroDollarString(String(prompt + completion))
}

function pricingHoverText(modelId: string, pricing: OpenAiModelPricing | undefined): string {
  if (!pricing) return modelId
  const lines = [
    modelId,
    "pricing:",
    `  prompt: ${pricing.prompt}`,
    `  completion: ${pricing.completion}`,
  ]
  if (pricing.input_cache_read) {
    lines.push(`  input_cache_read: ${pricing.input_cache_read}`)
  }
  return lines.join("\n")
}

const aiChatMenuTriggerClass =
  "focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"

export type AiQueryChatModelSelectorProps = {
  availableModels: OpenAiModelInfo[]
  selectedModel: string
  modelsLoading?: boolean
  modelsError?: boolean
  onModelSelect?: (model: string) => void
}

export function AiQueryChatModelSelector({
  availableModels,
  selectedModel,
  modelsLoading,
  modelsError,
  onModelSelect,
}: AiQueryChatModelSelectorProps) {
  const { t } = useTranslation()
  const [modelFilter, setModelFilter] = useState("")
  const [modelSort, setModelSort] = useState<ModelSortKey>("priceAsc")
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const modelListScrollRef = useRef<HTMLDivElement>(null)
  const selectedModelItemRef = useRef<HTMLDivElement>(null)

  const filteredModels = useMemo(() => {
    const q = modelFilter.trim().toLowerCase()
    const filtered = availableModels.filter((model) =>
      model.id.toLowerCase().includes(q),
    )
    if (modelSort === "id") return filtered
    const sorted = [...filtered]
    if (modelSort === "name") {
      sorted.sort((a, b) => a.id.localeCompare(b.id))
    } else {
      sorted.sort((a, b) =>
        compareModelsByPrice(a, b, modelSort === "priceAsc" ? "asc" : "desc"),
      )
    }
    return sorted
  }, [availableModels, modelFilter, modelSort])

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
        className="flex w-72 max-h-[min(70vh,32rem)] flex-col overflow-hidden p-0"
      >
        <div className="flex shrink-0 items-center gap-1 border-b border-border p-1">
          <Input
            value={modelFilter}
            onChange={(event) => setModelFilter(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder={t("dataExplorer.aiChatMenuFilterModels")}
            className="h-8 min-w-0 flex-1"
          />
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
              {MODEL_SORT_OPTIONS.map((key) => (
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
        <div
          ref={modelListScrollRef}
          className="h-0 min-h-0 flex-1 overflow-y-auto p-1"
        >
          {modelsLoading ? (
            <DropdownMenuItem disabled>{t("dataExplorer.aiChatMenuModelsLoading")}</DropdownMenuItem>
          ) : null}
          {!modelsLoading && modelsError ? (
            <DropdownMenuItem disabled>{t("dataExplorer.aiChatMenuModelsFallback")}</DropdownMenuItem>
          ) : null}
          {!modelsLoading && availableModels.length === 0 ? (
            <DropdownMenuItem disabled>{t("dataExplorer.aiChatMenuModelsEmpty")}</DropdownMenuItem>
          ) : null}
          {!modelsLoading && availableModels.length > 0 && filteredModels.length === 0 ? (
            <DropdownMenuItem disabled>{t("dataExplorer.aiChatMenuModelsNotFound")}</DropdownMenuItem>
          ) : null}
          {!modelsLoading
            ? filteredModels.map((model) => {
                const { id: modelId, pricing } = model
                return (
                  <DropdownMenuItem
                    key={modelId}
                    ref={selectedModel === modelId ? selectedModelItemRef : undefined}
                    className="gap-2"
                    data-model-selected={
                      selectedModel === modelId ? "true" : undefined
                    }
                    onSelect={() => onModelSelect?.(modelId)}
                  >
                    <span className="min-w-0 flex-1 truncate">{modelId}</span>
                    <span className="group/price relative shrink-0">
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {pricingIndicator(pricing)}
                      </span>
                      <span className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden w-56 whitespace-pre-wrap rounded border border-border bg-popover p-2 text-[10px] leading-relaxed text-popover-foreground shadow-md group-hover/price:block">
                        {pricingHoverText(modelId, pricing)}
                      </span>
                    </span>
                    {selectedModel === modelId ? (
                      <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
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
