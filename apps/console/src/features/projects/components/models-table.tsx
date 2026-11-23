import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, cn } from "@sb0rka/ui"
import type { LLMModel } from "../api"
import {
  defaultSortDirection,
  filterModels,
  modelCurrency,
  sortModels,
  type ModelCapability,
  type ModelSort,
  type ModelSortColumn,
} from "../models-utils"
import { useCapabilityLabels } from "./models-table-capabilities"
import { type ModelsTableSelection } from "./models-table-cells"
import { ModelsTableDesktop } from "./models-table-desktop"
import { ModelsTableMobile } from "./models-table-mobile"
import { ModelsTableToolbar } from "./models-table-toolbar"

export type { ModelsTableSelection }

export interface ModelsTableProps {
  models: LLMModel[]
  isLoading?: boolean
  isError?: boolean
  onRetry?: () => void
  emptyMessage?: string
  selection?: ModelsTableSelection
  filterable?: boolean
  layout?: "fill" | "auto"
  maxHeightClassName?: string
  className?: string
}

export function ModelsTable({
  models,
  isLoading = false,
  isError = false,
  onRetry,
  emptyMessage,
  selection,
  filterable = false,
  layout = "auto",
  maxHeightClassName,
  className,
}: ModelsTableProps) {
  const { t, i18n } = useTranslation()
  const labels = useCapabilityLabels()
  const [capabilities, setCapabilities] = useState<ModelCapability[]>([])
  const [sort, setSort] = useState<ModelSort>({ column: "name", direction: "asc" })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const currency = modelCurrency(i18n.language)
  const filtered = useMemo(
    () => (filterable ? filterModels(models, capabilities) : models),
    [filterable, models, capabilities],
  )
  const sorted = useMemo(
    () => sortModels(filtered, sort, currency, i18n.language),
    [filtered, sort, currency, i18n.language],
  )
  const selectedCount = selection
    ? models.filter((model) => selection.selectedIds.has(model.id)).length
    : 0

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

  if (isLoading) {
    return (
      <p role="status" className={cn("p-6 text-sm text-muted-foreground", className)}>
        {t("common.loading")}
      </p>
    )
  }

  if (isError) {
    return (
      <div role="alert" className={cn("flex flex-col items-start gap-3 p-6", className)}>
        <p className="text-sm text-destructive">{t("models.loadError")}</p>
        {onRetry ? (
          <Button type="button" variant="outline" onClick={onRetry}>
            {t("models.retry")}
          </Button>
        ) : null}
      </div>
    )
  }

  if (models.length === 0) {
    return (
      <p className={cn("p-6 text-sm text-muted-foreground", className)}>
        {emptyMessage ?? t("models.empty")}
      </p>
    )
  }

  return (
    <div className={cn(layout === "fill" ? "flex h-0 min-h-0 flex-1 flex-col" : "flex min-w-0 flex-col", className)}>
      {filterable || selection ? (
        <ModelsTableToolbar
          filterable={filterable}
          selection={selection}
          capabilities={capabilities}
          onToggleCapability={toggleCapability}
          onClearCapabilities={() => setCapabilities([])}
          sort={sort}
          onSort={handleSort}
          shown={sorted.length}
          total={models.length}
          selectedCount={selectedCount}
          labels={labels}
        />
      ) : null}
      <div
        className={cn(
          "flex min-w-0 flex-col",
          layout === "fill" && "h-0 min-h-0 flex-1 overflow-hidden pb-4 md:px-6 md:pb-6",
        )}
      >
        <ModelsTableMobile
          models={sorted}
          expandedId={expandedId}
          onToggleExpanded={toggleExpanded}
          selection={selection}
          labels={labels}
          currency={currency}
          layout={layout}
          maxHeightClassName={maxHeightClassName}
        />
        <ModelsTableDesktop
          models={sorted}
          sort={sort}
          onSort={handleSort}
          expandedId={expandedId}
          onToggleExpanded={toggleExpanded}
          selection={selection}
          labels={labels}
          currency={currency}
          layout={layout}
          maxHeightClassName={maxHeightClassName}
        />
      </div>
    </div>
  )
}
