import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Checkbox, cn, ScrollArea } from "@sb0rka/ui"
import type { LLMModel } from "../api"
import {
  formatModelPrice,
  formatTokenCount,
  modelDisplayName,
  type ModelCapability,
  type ModelCurrency,
} from "../models-utils"
import { DatasheetDetails } from "./models-table-details"
import {
  CapabilityIcons,
  ExpandControl,
  ModelIdentity,
  type ModelsTableSelection,
} from "./models-table-cells"

export function ModelsTableMobile({
  models,
  expandedId,
  onToggleExpanded,
  selection,
  labels,
  currency,
  layout,
  maxHeightClassName,
}: {
  models: LLMModel[]
  expandedId: string | null
  onToggleExpanded: (id: string) => void
  selection?: ModelsTableSelection
  labels: Record<ModelCapability, string>
  currency: ModelCurrency
  layout: "fill" | "auto"
  maxHeightClassName?: string
}) {
  const { t } = useTranslation()
  const bounded = layout === "auto" && Boolean(maxHeightClassName)

  function setModelSelected(id: string, selected: boolean) {
    if (!selection) return
    const next = new Set(selection.selectedIds)
    if (selected) next.add(id)
    else next.delete(id)
    selection.onChange(next)
  }

  const rows = models.length === 0 ? (
    <p className="px-4 py-8 text-xs text-muted-foreground">{t("models.emptyFiltered")}</p>
  ) : (
    models.map((model, index) => {
      const expanded = expandedId === model.id
      const name = modelDisplayName(model)
      const detailsId = `model-details-mobile-${model.id}`
      return (
        <div key={model.id} className={cn(index < models.length - 1 && "border-b border-border")}>
          <div
            className={cn(
              "group flex min-h-12 cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted",
              expanded && "bg-muted/25",
            )}
            onClick={() => onToggleExpanded(model.id)}
          >
            {selection ? (
              <div
                className="pt-0.5"
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
            <div className="min-w-0 flex-1">
              <ModelIdentity model={model} name={name} />
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
              onToggle={() => onToggleExpanded(model.id)}
            />
          </div>
          {expanded ? (
            <DatasheetDetails model={model} detailsId={detailsId} hasLeadingColumn={Boolean(selection)} />
          ) : null}
        </div>
      )
    })
  )

  return (
    <div className={cn("flex min-w-0 flex-col md:hidden", layout === "fill" && "h-0 min-h-0 flex-1")}>
      <div className="flex h-10 shrink-0 items-center border-b border-border px-4 text-xs font-medium text-muted-foreground">
        {t("models.columns.model")}
      </div>
      <MobileScroller scrollable={layout === "fill" || bounded} layout={layout} maxHeightClassName={maxHeightClassName}>
        {rows}
      </MobileScroller>
    </div>
  )
}

function MobileScroller({
  scrollable,
  layout,
  maxHeightClassName,
  children,
}: {
  scrollable: boolean
  layout: "fill" | "auto"
  maxHeightClassName?: string
  children: ReactNode
}) {
  if (!scrollable || (layout === "auto" && maxHeightClassName)) {
    return <div className={cn(layout === "auto" && maxHeightClassName, "overflow-auto")}>{children}</div>
  }
  return (
    <ScrollArea
      className="h-0 min-h-0 flex-1"
    >
      {children}
    </ScrollArea>
  )
}
