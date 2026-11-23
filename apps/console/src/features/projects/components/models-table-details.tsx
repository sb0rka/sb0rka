import { useTranslation } from "react-i18next"
import { ArrowRight } from "lucide-react"
import { cn } from "@sb0rka/ui"
import type { LLMModel } from "../api"
import {
  cachedInputDiscountPercent,
  formatExactModelPrice,
  formatModelPrice,
  formatTokenCount,
  modelCurrency,
  modelDescription,
  modelPriceAmount,
} from "../models-utils"

const SPEC_LABEL = "text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
const PILL = "inline-flex items-center rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
const CHIP = "inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] leading-4 text-foreground"

function LimitFigure({ label, value }: { label: string; value: number | undefined }) {
  const { t } = useTranslation()
  const formatted = formatTokenCount(value)
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", formatted ? "font-medium text-foreground" : "text-muted-foreground")}>
        {formatted ?? t("common.notAvailable")}
      </dd>
    </div>
  )
}

function PricingLedger({ model }: { model: LLMModel }) {
  const { t, i18n } = useTranslation()
  const currency = modelCurrency(i18n.language)
  const discount = cachedInputDiscountPercent(model, currency)
  const requestFeeAmount = modelPriceAmount(model, "request_fee", currency)
  const rows = [
    ["input", model.pricing?.input_per_1m],
    ["output", model.pricing?.output_per_1m],
    ["cachedInput", model.pricing?.cached_input_per_1m],
    ["requestFee", model.pricing?.request_fee],
  ] as const

  return (
    <dl className="space-y-1.5">
      {rows.map(([key, amounts]) => {
        const value = formatModelPrice(amounts, currency)
        const exact = formatExactModelPrice(amounts, currency)
        const mutedZero = key === "requestFee" && requestFeeAmount === 0
        return (
          <div key={key} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">{t(`models.specs.${key}`)}</dt>
            <dd
              title={exact && value && exact !== value ? exact : undefined}
              className={cn(
                "flex items-center gap-1.5 tabular-nums",
                value && !mutedZero ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {key === "cachedInput" && discount != null ? (
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums text-foreground/80">
                  {t("models.specs.cacheOff", { percent: discount })}
                </span>
              ) : null}
              <span>{value ?? t("common.notAvailable")}</span>
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

function ModalityFlow({ model }: { model: LLMModel }) {
  const { t } = useTranslation()
  const input = model.specifications?.modalities?.input ?? []
  const output = model.specifications?.modalities?.output ?? []
  if (input.length === 0 && output.length === 0) return null

  function label(value: string): string {
    if (value === "text" || value === "image") return t(`models.modality.${value}`)
    return value
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {input.map((value) => (
        <span key={`in-${value}`} className={PILL}>{label(value)}</span>
      ))}
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      {output.length > 0 ? output.map((value) => (
        <span key={`out-${value}`} className={PILL}>{label(value)}</span>
      )) : (
        <span className="text-sm text-muted-foreground">{t("common.notAvailable")}</span>
      )}
    </div>
  )
}

function ReasoningSpecs({ model }: { model: LLMModel }) {
  const { t } = useTranslation()
  const options = model.specifications?.reasoning_options ?? []
  if (options.length === 0) {
    if (model.specifications?.reasoning == null) return null
    return (
      <p className="text-sm text-muted-foreground">
        {t(model.specifications.reasoning ? "common.yes" : "common.no")}
      </p>
    )
  }
  return (
    <div className="space-y-1.5">
      {options.map((option) => (
        <div key={option.type} className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{option.type}</span>
          {option.values.map((value) => (
            <span key={value} className={CHIP}>{value}</span>
          ))}
        </div>
      ))}
    </div>
  )
}

function hasModalities(model: LLMModel): boolean {
  const modalities = model.specifications?.modalities
  return (modalities?.input?.length ?? 0) > 0 || (modalities?.output?.length ?? 0) > 0
}

function hasReasoning(model: LLMModel): boolean {
  return model.specifications?.reasoning != null || (model.specifications?.reasoning_options?.length ?? 0) > 0
}

function SpecIdentity({ model }: { model: LLMModel }) {
  const { i18n } = useTranslation()
  const description = modelDescription(model, i18n.language)
  if (!description) return null
  return (
    <p className="border-b border-border/50 pb-3 text-sm leading-5 text-muted-foreground md:col-span-3">
      {description}
    </p>
  )
}

export function DatasheetDetails({
  model,
  detailsId,
  hasLeadingColumn = true,
}: {
  model: LLMModel
  detailsId?: string
  hasLeadingColumn?: boolean
}) {
  const { t } = useTranslation()
  const context = model.specifications?.limit?.context
  const output = model.specifications?.limit?.output
  const showIo = hasModalities(model) || hasReasoning(model)
  return (
    <div
      id={detailsId}
      className={cn(
        "relative grid grid-cols-1 gap-x-8 gap-y-4 border-t border-border/50 bg-muted/25 px-4 py-4 before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-foreground/25 md:grid-cols-3 md:pr-[calc(2.5rem+0.75rem)]",
        hasLeadingColumn ? "md:pl-[calc(2.5rem+0.75rem)]" : "md:pl-3",
      )}
    >
      <SpecIdentity model={model} />
      <section className="space-y-2.5 md:col-start-1">
        <h3 className={SPEC_LABEL}>{t("models.specs.limits")}</h3>
        <dl className="space-y-1.5">
          <LimitFigure label={t("models.specs.context")} value={context} />
          <LimitFigure label={t("models.specs.maxOutput")} value={output} />
        </dl>
      </section>
      <section className="space-y-2.5">
        <h3 className={SPEC_LABEL}>{t("models.specs.pricing")}</h3>
        <PricingLedger model={model} />
      </section>
      <section className="space-y-4">
        {hasModalities(model) ? (
          <div className="space-y-2.5">
            <h3 className={SPEC_LABEL}>{t("models.specs.modalities")}</h3>
            <ModalityFlow model={model} />
          </div>
        ) : null}
        {hasReasoning(model) ? (
          <div className="space-y-2.5">
            <h3 className={SPEC_LABEL}>{t("models.specs.reasoning")}</h3>
            <ReasoningSpecs model={model} />
          </div>
        ) : null}
        {showIo ? null : <p className="text-sm text-muted-foreground">{t("common.notAvailable")}</p>}
      </section>
    </div>
  )
}
