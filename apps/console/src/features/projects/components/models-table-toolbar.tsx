import { useTranslation } from "react-i18next"
import { ArrowUpDown, Check } from "lucide-react"
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@sb0rka/ui"
import {
  MODEL_CAPABILITIES,
  type ModelCapability,
  type ModelSort,
  type ModelSortColumn,
} from "../models-utils"
import { CAPABILITY_ICONS } from "./models-table-capabilities"
import type { ModelsTableSelection } from "./models-table-cells"

export function ModelsTableToolbar({
  filterable,
  selection,
  capabilities,
  onToggleCapability,
  onClearCapabilities,
  sort,
  onSort,
  onSelectAll,
  shown,
  total,
  selectedCount,
  labels,
}: {
  filterable: boolean
  selection?: ModelsTableSelection
  capabilities: ModelCapability[]
  onToggleCapability: (capability: ModelCapability) => void
  onClearCapabilities: () => void
  sort: ModelSort
  onSort: (column: ModelSortColumn) => void
  onSelectAll: () => void
  shown: number
  total: number
  selectedCount: number
  labels: Record<ModelCapability, string>
}) {
  const { t } = useTranslation()
  const filtersActive = capabilities.length > 0

  const selectionLabel = selectedCount === 0
    ? t("models.selection.none")
    : selectedCount === total
      ? t("models.selection.all", { total })
      : t("models.selection.some", { count: selectedCount, total })

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 p-4 md:p-6 md:pb-4">
      {filterable ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div role="group" aria-label={t("models.filtersLabel")} className="flex flex-wrap gap-2">
            {MODEL_CAPABILITIES.map((capability) => {
              const pressed = capabilities.includes(capability)
              const Icon = CAPABILITY_ICONS[capability]
              return (
                <div
                  key={capability}
                  tabIndex={0}
                  aria-pressed={pressed}
                  onClick={() => onToggleCapability(capability)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      onToggleCapability(capability)
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
          {filtersActive ? (
            <span className="inline-flex items-center gap-1 pl-1 text-sm text-muted-foreground">
              <span className="tabular-nums">{t("models.showing", { count: shown })}</span>
              <span aria-hidden>·</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-1 py-0"
                onClick={onClearCapabilities}
              >
                {t("models.resetFilters")}
              </Button>
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        {selection ? (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span aria-live="polite" className="tabular-nums">{selectionLabel}</span>
            <span aria-hidden>·</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-1 py-0"
              onClick={selectedCount === 0 ? onSelectAll : () => selection.onChange(new Set())}
            >
              {t(selectedCount === 0 ? "models.selectAllModels" : "models.clearSelection")}
            </Button>
          </div>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="shrink-0 md:hidden">
              <ArrowUpDown className="mr-2 size-4" aria-hidden />
              {t(`models.sort.${sort.column}`)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(["name", "context", "inputPrice", "outputPrice"] as const).map((column) => (
              <DropdownMenuItem key={column} className="gap-2" onSelect={() => onSort(column)}>
                <span className="flex-1">{t(`models.sort.${column}`)}</span>
                {sort.column === column ? <Check className="size-4 text-muted-foreground" aria-hidden /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
