import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowDown, ArrowUp, ArrowUpDown, Brain, Check, ChevronDown, Image, Paperclip, Wrench, type LucideIcon } from "lucide-react"
import {
  Button,
  Checkbox,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ScrollArea,
  ScrollBar,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@sb0rka/ui"
import type { LLMModel } from "../api"
import {
  MODEL_CAPABILITIES,
  defaultSortDirection,
  filterModels,
  formatModelPrice,
  formatTokenCount,
  modelCapabilities,
  modelCurrency,
  modelDisplayName,
  sortModels,
  type ModelCapability,
  type ModelSort,
  type ModelSortColumn,
} from "../models-utils"
import { DatasheetDetails } from "./models-table-details"

const MODEL_TABLE_GRID =
  "grid w-full items-stretch grid-cols-[2.5rem_minmax(16rem,2.4fr)_6.5rem_6rem_7rem_7rem_2.5rem]"
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
                className="inline-flex rounded-sm text-muted-foreground/80 outline-none transition-colors group-hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
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
  const [capabilities, setCapabilities] = useState<ModelCapability[]>([])
  const [sort, setSort] = useState<ModelSort>({ column: "name", direction: "asc" })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const currency = modelCurrency(i18n.language)

  const filtered = useMemo(
    () => filterModels(models, capabilities),
    [models, capabilities],
  )
  const sorted = useMemo(
    () => sortModels(filtered, sort, currency, i18n.language),
    [filtered, sort, currency, i18n.language],
  )

  const visibleIds = sorted.map((model) => model.id)
  const selectedVisible = visibleIds.filter((id) => selectedIds.has(id)).length
  const allVisibleSelected = visibleIds.length > 0 && selectedVisible === visibleIds.length
  const someVisibleSelected = selectedVisible > 0 && !allVisibleSelected
  const filtersActive = capabilities.length > 0
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
        <div className="flex flex-wrap items-center justify-between gap-2">
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
                    pressed && "border-foreground/15 bg-secondary text-foreground",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {labels[capability]}
                </div>
              )
            })}
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
              onClick={() => setCapabilities([])}
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
                      className={cn(
                        "group flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/50",
                        expanded && "bg-muted/25",
                      )}
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
                        <p className="truncate text-sm font-medium text-foreground">{name}</p>
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
                    {expanded ? <DatasheetDetails model={model} detailsId={detailsId} /> : null}
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
                  const detailsId = `model-details-desktop-${model.id}`
                  return (
                    <div key={model.id} className="border-b border-border">
                      <div
                        className={cn(
                          MODEL_TABLE_GRID,
                          "group cursor-pointer hover:bg-muted/50",
                          expanded && "bg-muted/25",
                        )}
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
                        <div className="flex min-w-0 items-center px-3 py-3">
                          <p className="truncate text-sm font-medium text-foreground">{name}</p>
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
                      {expanded ? <DatasheetDetails model={model} detailsId={detailsId} /> : null}
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
