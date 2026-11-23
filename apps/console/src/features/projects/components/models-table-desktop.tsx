import { useEffect, useRef, type ReactNode, type RefObject } from "react"
import { useTranslation } from "react-i18next"
import { Checkbox, cn, ScrollArea, ScrollBar } from "@sb0rka/ui"
import type { LLMModel } from "../api"
import {
  formatExactModelPrice,
  formatModelPrice,
  formatTokenCount,
  modelDisplayName,
  type ModelCapability,
  type ModelCurrency,
  type ModelSort,
  type ModelSortColumn,
} from "../models-utils"
import { DatasheetDetails } from "./models-table-details"
import {
  CapabilityIcons,
  ExpandControl,
  ModelIdentity,
  SortHeader,
  type ModelsTableSelection,
} from "./models-table-cells"

const MODEL_TABLE_GRID =
  "grid w-full items-stretch grid-cols-[minmax(16rem,2.4fr)_8.5rem_7.5rem_8.5rem_8.5rem_2.5rem]"
const MODEL_TABLE_GRID_WITH_SELECTION =
  "grid w-full items-stretch grid-cols-[2.5rem_minmax(16rem,2.4fr)_8.5rem_7.5rem_8.5rem_8.5rem_2.5rem]"

export function ModelsTableDesktop({
  models,
  sort,
  onSort,
  expandedId,
  onToggleExpanded,
  selection,
  labels,
  currency,
  layout,
  maxHeightClassName,
}: {
  models: LLMModel[]
  sort: ModelSort
  onSort: (column: ModelSortColumn) => void
  expandedId: string | null
  onToggleExpanded: (id: string) => void
  selection?: ModelsTableSelection
  labels: Record<ModelCapability, string>
  currency: ModelCurrency
  layout: "fill" | "auto"
  maxHeightClassName?: string
}) {
  const { t } = useTranslation()
  const headerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const bounded = layout === "auto" && Boolean(maxHeightClassName)
  const scrollable = layout === "fill" || bounded
  const grid = selection ? MODEL_TABLE_GRID_WITH_SELECTION : MODEL_TABLE_GRID
  const minWidth = selection ? "min-w-[900px]" : "min-w-[860px]"
  const visibleIds = models.map((model) => model.id)
  const selectedVisible = selection ? visibleIds.filter((id) => selection.selectedIds.has(id)).length : 0
  const allVisibleSelected = visibleIds.length > 0 && selectedVisible === visibleIds.length
  const someVisibleSelected = selectedVisible > 0 && !allVisibleSelected

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
  }, [models.length, scrollable])

  function setVisibleSelection(selected: boolean) {
    if (!selection) return
    const next = new Set(selection.selectedIds)
    for (const id of visibleIds) {
      if (selected) next.add(id)
      else next.delete(id)
    }
    selection.onChange(next)
  }

  function setModelSelected(id: string, selected: boolean) {
    if (!selection) return
    const next = new Set(selection.selectedIds)
    if (selected) next.add(id)
    else next.delete(id)
    selection.onChange(next)
  }

  const rows = models.length === 0 ? (
    <p className="px-4 py-8 text-sm text-muted-foreground">{t("models.emptyFiltered")}</p>
  ) : (
    models.map((model) => {
      const expanded = expandedId === model.id
      const name = modelDisplayName(model)
      const inputPrice = formatModelPrice(model.pricing?.input_per_1m, currency)
      const exactInputPrice = formatExactModelPrice(model.pricing?.input_per_1m, currency)
      const outputPrice = formatModelPrice(model.pricing?.output_per_1m, currency)
      const exactOutputPrice = formatExactModelPrice(model.pricing?.output_per_1m, currency)
      const detailsId = `model-details-desktop-${model.id}`
      return (
        <div key={model.id} className="border-b border-border">
          <div
            className={cn(grid, "group cursor-pointer hover:bg-muted/50", expanded && "bg-muted/25")}
            onClick={() => onToggleExpanded(model.id)}
          >
            {selection ? (
              <div
                className="flex items-center justify-center"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <Checkbox
                  checked={selection.selectedIds.has(model.id)}
                  aria-label={t("models.selectModel", { name })}
                  onCheckedChange={(value) => setModelSelected(model.id, value === true)}
                />
              </div>
            ) : null}
            <div className="flex min-w-0 flex-col justify-center px-3 py-3">
              <ModelIdentity model={model} name={name} />
            </div>
            <div className="flex min-w-0 items-center px-3 py-3">
              <CapabilityIcons model={model} labels={labels} layout="grid" />
            </div>
            <div className="flex items-center justify-end px-3 py-3 text-sm tabular-nums text-foreground">
              {formatTokenCount(model.specifications?.limit?.context) ?? t("common.notAvailable")}
            </div>
            <div
              title={exactInputPrice && inputPrice && exactInputPrice !== inputPrice ? exactInputPrice : undefined}
              className="flex items-center justify-end px-3 py-3 text-sm tabular-nums text-foreground"
            >
              {inputPrice ?? t("common.notAvailable")}
            </div>
            <div
              title={exactOutputPrice && outputPrice && exactOutputPrice !== outputPrice ? exactOutputPrice : undefined}
              className="flex items-center justify-end px-3 py-3 text-sm tabular-nums text-foreground"
            >
              {outputPrice ?? t("common.notAvailable")}
            </div>
            <div className="flex items-center justify-center">
              <ExpandControl
                expanded={expanded}
                name={name}
                detailsId={detailsId}
                onToggle={() => onToggleExpanded(model.id)}
              />
            </div>
          </div>
          {expanded ? (
            <DatasheetDetails model={model} detailsId={detailsId} hasLeadingColumn={Boolean(selection)} />
          ) : null}
        </div>
      )
    })
  )

  return (
    <div className={cn("hidden min-w-0 flex-col md:flex", layout === "fill" && "h-0 min-h-0 flex-1")}>
      <div className="shrink-0 overflow-hidden">
        <div ref={headerRef} className={cn(grid, minWidth, "border-b border-border bg-card")}>
          {selection ? (
            <div className="flex h-12 items-center justify-center">
              <Checkbox
                checked={someVisibleSelected ? "indeterminate" : allVisibleSelected}
                disabled={visibleIds.length === 0}
                aria-label={t("models.selectAll")}
                onCheckedChange={(value) => setVisibleSelection(value === true)}
              />
            </div>
          ) : null}
          <SortHeader label={t("models.columns.model")} column="name" sort={sort} onSort={onSort} />
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
            onSort={onSort}
          />
          <SortHeader
            label={t("models.columns.input")}
            column="inputPrice"
            sort={sort}
            align="end"
            onSort={onSort}
          />
          <SortHeader
            label={t("models.columns.output")}
            column="outputPrice"
            sort={sort}
            align="end"
            onSort={onSort}
          />
          <div className="h-12" />
        </div>
      </div>
      <DesktopScroller
        scrollable={scrollable}
        layout={layout}
        maxHeightClassName={maxHeightClassName}
        viewportRef={viewportRef}
        minWidth={minWidth}
      >
        {rows}
      </DesktopScroller>
    </div>
  )
}

function DesktopScroller({
  scrollable,
  layout,
  maxHeightClassName,
  viewportRef,
  minWidth,
  children,
}: {
  scrollable: boolean
  layout: "fill" | "auto"
  maxHeightClassName?: string
  viewportRef: RefObject<HTMLDivElement>
  minWidth: string
  children: ReactNode
}) {
  const body = <div className={cn("w-full", minWidth)}>{children}</div>
  if (!scrollable) {
    return (
      <div ref={viewportRef} className="overflow-x-auto">
        {body}
      </div>
    )
  }
  return (
    <ScrollArea
      type="always"
      viewportRef={viewportRef}
      className={cn(
        layout === "fill" && "h-0 min-h-0 flex-1",
        layout === "auto" && maxHeightClassName,
        layout === "auto" && maxHeightClassName && "[&_[data-radix-scroll-area-viewport]]:max-h-[inherit]",
      )}
    >
      {body}
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
