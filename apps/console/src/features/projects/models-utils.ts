import type { LLMModel, LLMMoneyAmounts } from "./api"

export const MODEL_CAPABILITIES = ["reasoning", "toolCall", "vision", "attachment"] as const

export type ModelCapability = (typeof MODEL_CAPABILITIES)[number]

export type ModelSortColumn = "name" | "context" | "inputPrice" | "outputPrice"

export type SortDirection = "asc" | "desc"

export interface ModelSort {
  column: ModelSortColumn
  direction: SortDirection
}

export type ModelCurrency = "RUB" | "USD"

type PriceField = "input_per_1m" | "output_per_1m" | "cached_input_per_1m" | "request_fee"

export function modelCurrency(language: string): ModelCurrency {
  return language.startsWith("ru") ? "RUB" : "USD"
}

export function modelDisplayName(model: LLMModel): string {
  const name = model.name?.trim()
  return name || model.slug
}

export function modelDescription(model: LLMModel, language: string): string {
  const ru = model.description_ru?.trim() ?? ""
  const en = model.description_en?.trim() ?? ""
  if (language.startsWith("ru")) return ru || en
  return en || ru
}

export function modelCapabilities(model: LLMModel): ModelCapability[] {
  const specs = model.specifications
  const capabilities: ModelCapability[] = []
  if (specs?.reasoning) capabilities.push("reasoning")
  if (specs?.tool_call) capabilities.push("toolCall")
  if (specs?.modalities?.input?.includes("image")) capabilities.push("vision")
  if (specs?.attachment) capabilities.push("attachment")
  return capabilities
}

export function defaultSortDirection(column: ModelSortColumn): SortDirection {
  return column === "context" ? "desc" : "asc"
}

function groupInteger(value: number): string {
  const sign = value < 0 ? "−" : ""
  const digits = Math.abs(Math.round(value)).toString()
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f")
}

// Catalog context windows are powers of 1024 (128K, 256K, 1M).
export function formatTokenCount(value: number | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null
  const rounded = Math.round(value)
  const mib = 1024 * 1024
  if (rounded >= mib) return `${trimScaled(rounded / mib)}M`
  if (rounded >= 1024) return `${trimScaled(rounded / 1024)}K`
  return groupInteger(rounded)
}

export function formatExactTokens(value: number | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null
  return groupInteger(value)
}

function trimScaled(value: number): string {
  if (Number.isInteger(value)) return groupInteger(value)
  return value.toFixed(1).replace(/\.0$/, "")
}

function formatRawAmount(raw: string | undefined): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null
  const trimmed = raw.trim()
  const match = trimmed.match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!match) {
    const value = Number(trimmed)
    if (!Number.isFinite(value)) return null
    return groupInteger(value)
  }
  const sign = match[1] === "-" ? "−" : ""
  const whole = match[2].replace(/^0+(?=\d)/, "")
  const fraction = (match[3] ?? "").replace(/0+$/, "")
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f")
  if (!fraction) return `${sign}${grouped}`
  return `${sign}${grouped}.${fraction}`
}

export function modelPriceAmount(
  model: LLMModel,
  field: PriceField,
  currency: ModelCurrency,
): number | null {
  const raw = model.pricing?.[field]?.[currency]
  if (typeof raw !== "string" || raw.trim() === "") return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

// Integer percent off the input price. Zero or a higher cache price is not a discount.
export function cachedInputDiscountPercent(
  model: LLMModel,
  currency: ModelCurrency,
): number | null {
  const input = modelPriceAmount(model, "input_per_1m", currency)
  const cached = modelPriceAmount(model, "cached_input_per_1m", currency)
  if (input == null || cached == null || input <= 0 || cached < 0 || cached >= input) return null
  const percent = Math.round((1 - cached / input) * 100)
  return percent > 0 ? percent : null
}

export function formatModelPrice(
  amounts: LLMMoneyAmounts | undefined,
  currency: ModelCurrency,
): string | null {
  const text = formatRawAmount(amounts?.[currency])
  if (!text) return null
  if (currency === "USD") {
    if (text.startsWith("−")) return `−$${text.slice(1)}`
    return `$${text}`
  }
  return `${text}\u00a0₽`
}

export function filterModels(
  models: LLMModel[],
  capabilities: readonly ModelCapability[],
): LLMModel[] {
  if (capabilities.length === 0) return models
  return models.filter(model => {
    const present = new Set(modelCapabilities(model))
    return capabilities.every(capability => present.has(capability))
  })
}

export function sortModels(
  models: LLMModel[],
  sort: ModelSort,
  currency: ModelCurrency,
  language: string,
): LLMModel[] {
  const next = [...models]
  next.sort((left, right) => {
    const compared = compareModels(left, right, sort, currency, language)
    if (compared !== 0) return compared
    return left.slug.localeCompare(right.slug, undefined, { numeric: true, sensitivity: "base" })
  })
  return next
}

function compareModels(
  left: LLMModel,
  right: LLMModel,
  sort: ModelSort,
  currency: ModelCurrency,
  language: string,
): number {
  if (sort.column === "name") {
    const result = modelDisplayName(left).localeCompare(modelDisplayName(right), language, {
      numeric: true,
      sensitivity: "base",
    })
    return sort.direction === "asc" ? result : -result
  }
  if (sort.column === "context") {
    return compareMissingLast(
      left.specifications?.limit?.context,
      right.specifications?.limit?.context,
      sort.direction,
    )
  }
  const field = sort.column === "inputPrice" ? "input_per_1m" : "output_per_1m"
  return compareMissingLast(
    modelPriceAmount(left, field, currency),
    modelPriceAmount(right, field, currency),
    sort.direction,
  )
}

function compareMissingLast(
  left: number | null | undefined,
  right: number | null | undefined,
  direction: SortDirection,
): number {
  if (left == null || !Number.isFinite(left)) {
    return right == null || !Number.isFinite(right) ? 0 : 1
  }
  if (right == null || !Number.isFinite(right)) return -1
  const diff = left - right
  return direction === "asc" ? diff : -diff
}

export function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'"
}

export function chatCompletionsCurl(baseUrl: string, slug: string, message: string): string {
  const payload = JSON.stringify({ model: slug, messages: [{ role: "user", content: message }] }, null, 2)
  return [
    "curl " + shellQuote(baseUrl.replace(/\/+$/, "") + "/chat/completions"),
    "  -H \"Authorization: Bearer $SB0RKA_LLM_KEY\"",
    "  -H \"Content-Type: application/json\"",
    "  -d " + shellQuote(payload),
  ].join(" \\\n")
}
