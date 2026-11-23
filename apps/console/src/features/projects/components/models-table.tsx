import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { ArrowDown, ArrowUp, ArrowUpDown, Brain, Check, ChevronDown, Copy, Image, Paperclip, Wrench, X, type LucideIcon } from "lucide-react"
import {
  Button,
  Checkbox,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  ScrollArea,
  ScrollBar,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useToast,
} from "@sb0rka/ui"
import type { LLMModel } from "../api"
import {
  MODEL_CAPABILITIES,
  defaultSortDirection,
  filterModels,
  formatExactTokens,
  formatModelPrice,
  formatTokenCount,
  modelCapabilities,
  modelCurrency,
  modelDescription,
  modelDisplayName,
  sortModels,
  type ModelCapability,
  type ModelSort,
  type ModelSortColumn,
} from "../models-utils"

const MODEL_TABLE_GRID =
  "grid w-full grid-cols-[2.5rem_minmax(16rem,2.4fr)_6.5rem_6rem_7rem_7rem_2.5rem] items-stretch"
const MODEL_TABLE_MIN_WIDTH = "min-w-[860px]"

const CAPABILITY_ICONS: Record<ModelCapability, LucideIcon> = {
  reasoning: Brain,
  toolCall: Wrench,
  vision: Image,
  attachment: Paperclip,
}

interface ModelsTableProps {
  models: LLMModel[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  selectedIds: ReadonlySet<string>
  onSelectedIdsChange: (next: Set<string>) => void
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function highlight(value: string, query: string): ReactNode {
  const normalized = query.trim()
  if (!normalized) return value
  const parts = value.split(new RegExp(`(${escapeRegExp(normalized)})`, "gi"))
  return parts.map((part, index) => {
    if (!part) return null
    const isMatch = part.toLowerCase() === normalized.toLowerCase()
    return (
      <span
        key={`${part}-${index}`}
        className={isMatch ? "font-semibold text-[#2b9a66] underline decoration-[#2b9a66]/60" : undefined}
      >
        {part}
      </span>
    )
  })
}

function useCapabilityLabels(): Record<ModelCapability, string> {
  const { t } = useTranslation()
  return useMemo(
    () => ({
      reasoning: t("models.filters.reasoning"),
      toolCall: t("models.filters.toolCall"),
      vision: t("models.filters.vision"),
      attachment: t("models.filters.attachment"),
    }),
    [t],
  )
}

function SortHeader({
  label,
  column,
  sort,
  align = "start",
  onSort,
}: {
  label: string
  column: ModelSortColumn
  sort: ModelSort
  align?: "start" | "end"
  onSort: (column: ModelSortColumn) => void
}) {
  const active = sort.column === column
  return (
    <div
      role="columnheader"
      tabIndex={0}
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      onClick={() => onSort(column)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onSort(column)
        }
      }}
      className={cn(
        "flex h-12 min-w-0 cursor-pointer items-center gap-1 px-3 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
        align === "end" && "justify-end text-right",
        active && "text-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      {active ? (
        sort.direction === "asc" ? (
          <ArrowUp className="size-3.5 shrink-0" aria-hidden />
        ) : (
          <ArrowDown className="size-3.5 shrink-0" aria-hidden />
        )
      ) : null}
    </div>
  )
}

function CapabilityIcons({
  model,
  labels,
}: {
  model: LLMModel
  labels: Record<ModelCapability, string>
}) {
  const { t } = useTranslation()
  const capabilities = modelCapabilities(model)
  if (capabilities.length === 0) {
    return <span className="text-sm text-muted-foreground">{t("common.notAvailable")}</span>
  }
  return (
    <div className="flex items-center gap-1.5">
      {capabilities.map((capability) => {
        const Icon = CAPABILITY_ICONS[capability]
        const label = labels[capability]
        return (
          <Tooltip key={capability}>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                aria-label={label}
                className="inline-flex rounded-sm text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Icon className="size-4" aria-hidden />
              </span>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

function ModelDetails({ model, query, detailsId }: { model: LLMModel; query: string; detailsId: string }) {
  const { t, i18n } = useTranslation()
  const { showSuccess, showError } = useToast()
  const currency = modelCurrency(i18n.language)
  const description = modelDescription(model, i18n.language)
  const context = model.specifications?.limit?.context
  const output = model.specifications?.limit?.output
  const modalities = model.specifications?.modalities
  const reasoningOptions = model.specifications?.reasoning_options ?? []
  const showReasoning = model.specifications?.reasoning != null || reasoningOptions.length > 0
  const inputModalities = modalities?.input ?? []
  const outputModalities = modalities?.output ?? []

  function modalityLabel(value: string): string {
    if (value === "text" || value === "image") return t(`models.modality.${value}`)
    return value
  }

  function tokenLabel(value: number | undefined): string {
    const compact = formatTokenCount(value)
    const exact = formatExactTokens(value)
    if (!compact || !exact) return t("common.notAvailable")
    if (compact === exact) return t("models.specs.tokens", { count: exact })
    return t("models.specs.tokensCompact", { compact, exact })
  }

  async function copySlug() {
    try {
      await navigator.clipboard.writeText(model.slug)
      showSuccess(t("common.messages.copied"))
    } catch {
      showError(t("common.messages.copyFailed"))
    }
  }

  const prices = [
    ["input", model.pricing?.input_per_1m],
    ["output", model.pricing?.output_per_1m],
    ["cachedInput", model.pricing?.cached_input_per_1m],
    ["requestFee", model.pricing?.request_fee],
  ] as const

  return (
    <div id={detailsId} className="grid gap-4 border-t border-border bg-muted/30 px-4 py-4 md:grid-cols-2 md:px-6">
      {description ? (
        <p className="text-sm text-muted-foreground md:col-span-2">{highlight(description, query)}</p>
      ) : null}
      <section className="space-y-1.5">
        <h3 className="text-sm font-medium text-foreground">{t("models.specs.limits")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("models.specs.context")}: {tokenLabel(context)}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("models.specs.maxOutput")}: {tokenLabel(output)}
        </p>
      </section>
      <section className="space-y-1.5">
        <h3 className="text-sm font-medium text-foreground">{t("models.specs.pricing")}</h3>
        {prices.map(([key, amounts]) => (
          <p key={key} className="text-sm text-muted-foreground">
            {t(`models.specs.${key}`)}:{" "}
            <span className="tabular-nums text-foreground">
              {formatModelPrice(amounts, currency) ?? t("common.notAvailable")}
            </span>
          </p>
        ))}
      </section>
      {inputModalities.length > 0 || outputModalities.length > 0 ? (
        <section className="space-y-1.5">
          <h3 className="text-sm font-medium text-foreground">{t("models.specs.modalities")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("models.specs.modalitiesValue", {
              input: inputModalities.map(modalityLabel).join(", ") || t("common.notAvailable"),
              output: outputModalities.map(modalityLabel).join(", ") || t("common.notAvailable"),
            })}
          </p>
        </section>
      ) : null}
      {showReasoning ? (
        <section className="space-y-1.5">
          <h3 className="text-sm font-medium text-foreground">{t("models.specs.reasoning")}</h3>
          {reasoningOptions.length > 0 ? (
            reasoningOptions.map((option) => (
              <p key={option.type} className="text-sm text-muted-foreground">
                {option.type}: {option.values.join(", ")}
              </p>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              {t(model.specifications?.reasoning ? "common.yes" : "common.no")}
            </p>
          )}
        </section>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 md:col-span-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copySlug()}>
          <Copy className="mr-2 size-3.5" aria-hidden />
          {t("models.specs.copySlug")}
        </Button>
        <code className="min-w-0 break-all font-mono text-xs text-muted-foreground">{model.slug}</code>
      </div>
    </div>
  )
}

function ExpandControl({
  expanded,
  name,
  detailsId,
  onToggle,
}: {
  expanded: boolean
  name: string
  detailsId: string
  onToggle: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      tabIndex={0}
      aria-expanded={expanded}
      aria-controls={detailsId}
      aria-label={t(expanded ? "models.collapse" : "models.expand", { name })}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          event.stopPropagation()
          onToggle()
        }
      }}
      className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
    >
      <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden />
    </div>
  )
}

export function ModelsTable({
  models,
  isLoading,
  isError,
  onRetry,
  selectedIds,
  onSelectedIdsChange,
}: ModelsTableProps) {
  const { t, i18n } = useTranslation()
  const labels = useCapabilityLabels()
  const [search, setSearch] = useState("")
  const [capabilities, setCapabilities] = useState<ModelCapability[]>([])
  const [sort, setSort] = useState<ModelSort>({ column: "name", direction: "asc" })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const currency = modelCurrency(i18n.language)

  const filtered = useMemo(
    () => filterModels(models, { query: search, capabilities, language: i18n.language, capabilityLabels: labels }),
    [models, search, capabilities, i18n.language, labels],
  )
  const sorted = useMemo(
    () => sortModels(filtered, sort, currency, i18n.language),
    [filtered, sort, currency, i18n.language],
  )

  const visibleIds = sorted.map((model) => model.id)
  const selectedVisible = visibleIds.filter((id) => selectedIds.has(id)).length
  const allVisibleSelected = visibleIds.length > 0 && selectedVisible === visibleIds.length
  const someVisibleSelected = selectedVisible > 0 && !allVisibleSelected
  const filtersActive = search.trim().length > 0 || capabilities.length > 0
  const selectedCount = models.filter((model) => selectedIds.has(model.id)).length

  useEffect(() => {
    const viewport = viewportRef.current
    const header = headerRef.current
    if (!viewport || !header) return
    const sync = () => {
      header.style.transform = `translateX(-${viewport.scrollLeft}px)`
    }
    sync()
    viewport.addEventListener("scroll", sync, { passive: true })
    return () => viewport.removeEventListener("scroll", sync)
  }, [sorted.length, isLoading, isError])

  function handleSort(column: ModelSortColumn) {
    setSort((current) => {
      if (current.column === column) {
        return { column, direction: current.direction === "asc" ? "desc" : "asc" }
      }
      return { column, direction: defaultSortDirection(column) }
    })
  }

  function toggleCapability(capability: ModelCapability) {
    setCapabilities((current) =>
      current.includes(capability)
        ? current.filter((item) => item !== capability)
        : [...current, capability],
    )
  }

  function toggleExpanded(id: string) {
    setExpandedId((current) => (current === id ? null : id))
  }

  function setVisibleSelection(selected: boolean) {
    const next = new Set(selectedIds)
    for (const id of visibleIds) {
      if (selected) next.add(id)
      else next.delete(id)
    }
    onSelectedIdsChange(next)
  }

  function setModelSelected(id: string, selected: boolean) {
    const next = new Set(selectedIds)
    if (selected) next.add(id)
    else next.delete(id)
    onSelectedIdsChange(next)
  }

  if (isLoading) {
    return (
      <p role="status" className="p-6 text-sm text-muted-foreground">
        {t("common.loading")}
      </p>
    )
  }

  if (isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 p-6">
        <p className="text-sm text-destructive">{t("models.loadError")}</p>
        <Button type="button" variant="outline" onClick={onRetry}>
          {t("models.retry")}
        </Button>
      </div>
    )
  }

  if (models.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">{t("models.empty")}</p>
  }

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 p-4 md:p-6 md:pb-4">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 max-w-md flex-1">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("models.searchPlaceholder")}
              aria-label={t("models.searchPlaceholder")}
              className="h-9 pr-9"
            />
            {search.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 size-9 text-muted-foreground hover:bg-transparent"
                aria-label={t("models.clearSearch")}
                onClick={() => setSearch("")}
              >
                <X className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="shrink-0 md:hidden">
                <ArrowUpDown className="mr-2 size-4" aria-hidden />
                {t(`models.sort.${sort.column}`)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(["name", "context", "inputPrice", "outputPrice"] as const).map((column) => (
                <DropdownMenuItem key={column} className="gap-2" onSelect={() => handleSort(column)}>
                  <span className="flex-1">{t(`models.sort.${column}`)}</span>
                  {sort.column === column ? <Check className="size-4 text-muted-foreground" aria-hidden /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div role="group" aria-label={t("models.filtersLabel")} className="flex flex-wrap gap-2">
          {MODEL_CAPABILITIES.map((capability) => {
            const pressed = capabilities.includes(capability)
            const Icon = CAPABILITY_ICONS[capability]
            return (
              <div
                key={capability}
                tabIndex={0}
                aria-pressed={pressed}
                onClick={() => toggleCapability(capability)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    toggleCapability(capability)
                  }
                }}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
                  pressed && "border-transparent bg-secondary text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {labels[capability]}
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{t("models.count", { shown: sorted.length, total: models.length })}</span>
          {selectedCount > 0 ? <span>{t("models.selected", { count: selectedCount })}</span> : null}
          {selectedCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-1 py-0"
              onClick={() => onSelectedIdsChange(new Set())}
            >
              {t("models.clearSelection")}
            </Button>
          ) : null}
          {filtersActive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-1 py-0"
              onClick={() => {
                setSearch("")
                setCapabilities([])
              }}
            >
              {t("models.resetFilters")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden pb-4 md:px-6 md:pb-6">
        <div className="flex h-0 min-h-0 flex-1 flex-col md:hidden">
          <ScrollArea className="h-0 min-h-0 flex-1">
            {sorted.length === 0 ? (
              <p className="px-4 py-8 text-sm text-muted-foreground">{t("models.emptyFiltered")}</p>
            ) : (
              sorted.map((model) => {
                const expanded = expandedId === model.id
                const name = modelDisplayName(model)
                const detailsId = `model-details-mobile-${model.id}`
                return (
                  <div key={model.id} className="border-b border-border">
                    <div
                      className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/50"
                      onClick={() => toggleExpanded(model.id)}
                    >
                      <div
                        className="pt-0.5"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedIds.has(model.id)}
                          aria-label={t("models.selectModel", { name })}
                          onCheckedChange={(value) => setModelSelected(model.id, value === true)}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{highlight(name, search)}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{highlight(model.slug, search)}</p>
                        <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                          {formatTokenCount(model.specifications?.limit?.context) ?? t("common.notAvailable")}
                          {" · "}
                          {formatModelPrice(model.pricing?.input_per_1m, currency) ?? t("common.notAvailable")}
                          {" / "}
                          {formatModelPrice(model.pricing?.output_per_1m, currency) ?? t("common.notAvailable")}
                        </p>
                        <div className="mt-2">
                          <CapabilityIcons model={model} labels={labels} />
                        </div>
                      </div>
                      <ExpandControl
                        expanded={expanded}
                        name={name}
                        detailsId={detailsId}
                        onToggle={() => toggleExpanded(model.id)}
                      />
                    </div>
                    {expanded ? <ModelDetails model={model} query={search} detailsId={detailsId} /> : null}
                  </div>
                )
              })
            )}
          </ScrollArea>
        </div>

        <div className="hidden h-0 min-h-0 flex-1 flex-col md:flex">
          <div className="shrink-0 overflow-hidden">
            <div
              ref={headerRef}
              className={cn(MODEL_TABLE_GRID, MODEL_TABLE_MIN_WIDTH, "border-b border-border bg-card")}
            >
              <div className="flex h-12 items-center justify-center">
                <Checkbox
                  checked={someVisibleSelected ? "indeterminate" : allVisibleSelected}
                  disabled={visibleIds.length === 0}
                  aria-label={t("models.selectAll")}
                  onCheckedChange={(value) => setVisibleSelection(value === true)}
                />
              </div>
              <SortHeader label={t("models.columns.model")} column="name" sort={sort} onSort={handleSort} />
              <div
                className="flex h-12 min-w-0 items-center px-3 text-sm font-medium text-muted-foreground"
                title={t("models.columns.capabilities")}
              >
                <span className="truncate">{t("models.columns.capabilities")}</span>
              </div>
              <SortHeader
                label={t("models.columns.context")}
                column="context"
                sort={sort}
                align="end"
                onSort={handleSort}
              />
              <SortHeader
                label={t("models.columns.input")}
                column="inputPrice"
                sort={sort}
                align="end"
                onSort={handleSort}
              />
              <SortHeader
                label={t("models.columns.output")}
                column="outputPrice"
                sort={sort}
                align="end"
                onSort={handleSort}
              />
              <div className="h-12" />
            </div>
          </div>
          <ScrollArea type="always" viewportRef={viewportRef} className="h-0 min-h-0 flex-1">
            <div className={cn("w-full", MODEL_TABLE_MIN_WIDTH)}>
              {sorted.length === 0 ? (
                <p className="px-4 py-8 text-sm text-muted-foreground">{t("models.emptyFiltered")}</p>
              ) : (
                sorted.map((model) => {
                  const expanded = expandedId === model.id
                  const name = modelDisplayName(model)
                  const description = modelDescription(model, i18n.language)
                  const detailsId = `model-details-desktop-${model.id}`
                  return (
                    <div key={model.id} className="border-b border-border">
                      <div
                        className={cn(MODEL_TABLE_GRID, "cursor-pointer hover:bg-muted/50")}
                        onClick={() => toggleExpanded(model.id)}
                      >
                        <div
                          className="flex items-center justify-center"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <Checkbox
                            checked={selectedIds.has(model.id)}
                            aria-label={t("models.selectModel", { name })}
                            onCheckedChange={(value) => setModelSelected(model.id, value === true)}
                          />
                        </div>
                        <div className="flex min-w-0 flex-col justify-center px-3 py-3">
                          <p className="truncate text-sm font-medium text-foreground">{highlight(name, search)}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">{highlight(model.slug, search)}</p>
                          {description ? (
                            <p className="truncate text-xs text-muted-foreground">{highlight(description, search)}</p>
                          ) : null}
                        </div>
                        <div className="flex min-w-0 items-center px-3 py-3">
                          <CapabilityIcons model={model} labels={labels} />
                        </div>
                        <div className="flex items-center justify-end px-3 py-3 text-sm tabular-nums text-foreground">
                          {formatTokenCount(model.specifications?.limit?.context) ?? t("common.notAvailable")}
                        </div>
                        <div className="flex items-center justify-end px-3 py-3 text-sm tabular-nums text-foreground">
                          {formatModelPrice(model.pricing?.input_per_1m, currency) ?? t("common.notAvailable")}
                        </div>
                        <div className="flex items-center justify-end px-3 py-3 text-sm tabular-nums text-foreground">
                          {formatModelPrice(model.pricing?.output_per_1m, currency) ?? t("common.notAvailable")}
                        </div>
                        <div className="flex items-center justify-center">
                          <ExpandControl
                            expanded={expanded}
                            name={name}
                            detailsId={detailsId}
                            onToggle={() => toggleExpanded(model.id)}
                          />
                        </div>
                      </div>
                      {expanded ? <ModelDetails model={model} query={search} detailsId={detailsId} /> : null}
                    </div>
                  )
                })
              )}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
