import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button, cn } from "@sb0rka/ui"
import type { LLMModel } from "../api"
import {
  defaultSortDirection,
  filterModels,
  filterModelsByQuery,
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
import { ModelsTableToolbar, type ModelsTableScope } from "./models-table-toolbar"

export type { ModelsTableSelection }

export interface ModelsTableProps {
  models: LLMModel[]
  isLoading?: boolean
  isError?: boolean
  onRetry?: () => void
  emptyMessage?: string
  selection?: ModelsTableSelection
  filterable?: boolean
  searchable?: boolean
  scopeFilter?: boolean
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
  searchable = false,
  scopeFilter = false,
  layout = "auto",
  maxHeightClassName,
  className,
}: ModelsTableProps) {
  const { t, i18n } = useTranslation()
  const labels = useCapabilityLabels()
  const [capabilities, setCapabilities] = useState<ModelCapability[]>([])
  const [sort, setSort] = useState<ModelSort>({ column: "name", direction: "asc" })
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<ModelsTableScope>("all")
  // Rows must survive the toggle that would drop them from the active scope
  // (uncheck under "selected", check under "notAllowed"). A live filter would
  // unmount the row the user just toggled, hiding the undo affordance.
  const [scopeSnapshotIds, setScopeSnapshotIds] = useState<ReadonlySet<string>>(new Set())
  const currentScope = scopeFilter ? scope : "all"
  const currency = modelCurrency(i18n.language)
  const scoped = useMemo(() => {
    if (currentScope === "all" || !selection) return models
    return models.filter((model) => {
      const selected = selection.selectedIds.has(model.id)
      const pinned = scopeSnapshotIds.has(model.id)
      return currentScope === "selected" ? selected || pinned : !selected || pinned
    })
  }, [currentScope, models, selection, scopeSnapshotIds])
  const searched = useMemo(
    () => (searchable ? filterModelsByQuery(scoped, query, i18n.language) : scoped),
    [searchable, scoped, query, i18n.language],
  )
  const filtered = useMemo(
    () => (filterable ? filterModels(searched, capabilities) : searched),
    [filterable, searched, capabilities],
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

  // Union rather than replace: with search or capability filters active, a
  // replace would silently drop models the user allowed outside the view.
  // Views without those controls keep the original replace-all semantics.
  function selectAll() {
    if (!selection) return
    const narrowed = searchable || scopeFilter
    const next = new Set(narrowed ? selection.selectedIds : [])
    for (const model of narrowed ? sorted : models) next.add(model.id)
    selection.onChange(next)
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
      {filterable || selection || searchable || scopeFilter ? (
        <ModelsTableToolbar
          filterable={filterable}
          selection={selection}
          capabilities={capabilities}
          onToggleCapability={toggleCapability}
          onClearCapabilities={() => setCapabilities([])}
          sort={sort}
          onSort={handleSort}
          onSelectAll={selectAll}
          shown={sorted.length}
          total={models.length}
          selectedCount={selectedCount}
          labels={labels}
          searchable={searchable}
          query={query}
          onQueryChange={setQuery}
          scopeFilter={scopeFilter}
          scope={currentScope}
          onScopeChange={(next) => {
            if (next !== "all" && selection) {
              setScopeSnapshotIds(
                new Set(
                  models
                    .filter((model) =>
                      next === "selected"
                        ? selection.selectedIds.has(model.id)
                        : !selection.selectedIds.has(model.id),
                    )
                    .map((model) => model.id),
                ),
              )
            }
            setScope(next)
          }}
          scopeCounts={{
            all: models.length,
            selected: selectedCount,
            notAllowed: models.length - selectedCount,
          }}
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
