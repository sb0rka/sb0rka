import type {
  ProjectQuotaItem,
  ProjectUsageResponse,
  QuotaBalance,
  QuotaDefinitionSnippet,
  QuotaUsage,
} from "./api"

const NEAR_LIMIT_RATIO = 0.9
const WARNING_RATIO = 0.7

const WINDOWS = ["minute", "hour", "month"] as const

export type QuotaWindow = (typeof WINDOWS)[number]
export type ThresholdLevel = "neutral" | "warning" | "danger"

export interface QuotaRowView {
  code: string
  definition: QuotaDefinitionSnippet
  limitValue: number
  entitled: number
  effective: number
  usage: QuotaUsage | null
  ratio: number | null
  level: ThresholdLevel | null
  nearLimit: boolean
}

export function localizedName(
  item: { name_en: string; name_ru: string },
  language: string,
): string {
  const preferred = language.startsWith("ru") ? item.name_ru : item.name_en
  const trimmed = preferred.trim()
  if (trimmed) return trimmed
  return (item.name_en || item.name_ru).trim()
}

export function localizedDescription(
  item: { description_en?: string | null; description_ru?: string | null },
  language: string,
): string | undefined {
  const preferred = language.startsWith("ru") ? item.description_ru : item.description_en
  const trimmed = preferred?.trim()
  return trimmed || undefined
}

export function effectiveLimit(limitValue: number, entitled: number): number {
  return limitValue + entitled
}

export function usageRatio(used: number | null | undefined, effective: number): number | null {
  if (used == null || !Number.isFinite(used)) return null
  if (!Number.isFinite(effective) || effective <= 0) return used > 0 ? 1 : 0
  return used / effective
}

export function thresholdLevel(ratio: number | null): ThresholdLevel | null {
  if (ratio == null || !Number.isFinite(ratio)) return null
  if (ratio >= NEAR_LIMIT_RATIO) return "danger"
  if (ratio >= WARNING_RATIO) return "warning"
  return "neutral"
}

export function isNearLimit(ratio: number | null): boolean {
  return ratio != null && ratio >= NEAR_LIMIT_RATIO
}

export function windowLabelKey(window: string | null | undefined): QuotaWindow | null {
  if (window && (WINDOWS as readonly string[]).includes(window)) {
    return window as QuotaWindow
  }
  return null
}

export function balanceConsumedRatio(balance: QuotaBalance): number | null {
  return usageRatio(balance.used + balance.held, effectiveLimit(balance.limit, balance.entitled))
}

export function balanceIsNearLimit(balance: QuotaBalance): boolean {
  const cap = effectiveLimit(balance.limit, balance.entitled)
  if (cap > 0 && balance.available <= 0) return true
  return isNearLimit(balanceConsumedRatio(balance))
}

export function joinQuotaRows(
  items: ProjectQuotaItem[],
  usage: ProjectUsageResponse | null,
): QuotaRowView[] {
  return items.map((item) => {
    const effective = effectiveLimit(item.limit_value, item.entitled)
    const sample = usage?.usage[item.quota_definition.code] ?? null
    const measurable = sample?.status === "available" && sample.used != null
    const ratio = measurable ? usageRatio(sample.used, effective) : null
    return {
      code: item.quota_definition.code,
      definition: item.quota_definition,
      limitValue: item.limit_value,
      entitled: item.entitled,
      effective,
      usage: sample,
      ratio,
      level: thresholdLevel(ratio),
      nearLimit: isNearLimit(ratio),
    }
  })
}

export function summaryRows(rows: QuotaRowView[], count = 2): QuotaRowView[] {
  return [...rows]
    .sort((left, right) => (right.ratio ?? -1) - (left.ratio ?? -1))
    .slice(0, count)
}

export type RelativeAge =
  | { key: "justNow" }
  | { key: "minutesAgo" | "hoursAgo" | "daysAgo"; count: number }

export function relativeAge(iso: string | null | undefined, now = Date.now()): RelativeAge | null {
  if (!iso) return null
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return null
  const deltaSec = Math.max(0, Math.round((now - then) / 1000))
  if (deltaSec < 60) return { key: "justNow" }
  const minutes = Math.round(deltaSec / 60)
  if (minutes < 60) return { key: "minutesAgo", count: minutes }
  const hours = Math.round(minutes / 60)
  if (hours < 48) return { key: "hoursAgo", count: hours }
  return { key: "daysAgo", count: Math.round(hours / 24) }
}

function groupInteger(value: number): string {
  const sign = value < 0 ? "−" : ""
  const digits = Math.abs(Math.round(value)).toString()
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f")
}

function trimDecimal(value: number, digits: number): string {
  return value
    .toFixed(digits)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1")
}

const BYTE_UNITS = [
  { div: 1, suffix: "B" },
  { div: 1024, suffix: "KiB" },
  { div: 1024 ** 2, suffix: "MiB" },
  { div: 1024 ** 3, suffix: "GiB" },
  { div: 1024 ** 4, suffix: "TiB" },
] as const

const BPS_UNITS = [
  { div: 1, suffix: "bit/s" },
  { div: 1_000, suffix: "Kbit/s" },
  { div: 1_000_000, suffix: "Mbit/s" },
  { div: 1_000_000_000, suffix: "Gbit/s" },
] as const

function pickScale<T extends { div: number }>(units: readonly T[], basis: number): T {
  const abs = Math.abs(basis)
  let chosen = units[0]
  for (const unit of units) {
    if (abs >= unit.div) chosen = unit
  }
  return chosen
}

function formatScaled(value: number, div: number, suffix: string): string {
  if (div === 1) return `${groupInteger(value)} ${suffix}`
  const scaled = value / div
  if (Number.isInteger(scaled)) return `${groupInteger(scaled)} ${suffix}`
  const digits = Number(scaled.toFixed(1)) === Number(scaled.toFixed(2)) ? 1 : 2
  return `${trimDecimal(scaled, digits)} ${suffix}`
}

export function formatQuotaValue(value: number, unit: string, scaleBasis?: number): string {
  if (!Number.isFinite(value)) return "—"
  const basis = scaleBasis != null && Number.isFinite(scaleBasis) && scaleBasis !== 0
    ? scaleBasis
    : value
  switch (unit) {
    case "bytes": {
      const scale = pickScale(BYTE_UNITS, basis)
      return formatScaled(value, scale.div, scale.suffix)
    }
    case "bps": {
      const scale = pickScale(BPS_UNITS, basis)
      return formatScaled(value, scale.div, scale.suffix)
    }
    case "micros":
      return (value / 1_000_000).toFixed(2)
    default:
      return groupInteger(value)
  }
}

export function formatQuotaPair(
  used: number,
  limit: number,
  unit: string,
): { used: string; limit: string } {
  const basis = Math.max(Math.abs(used), Math.abs(limit))
  return {
    used: formatQuotaValue(used, unit, basis),
    limit: formatQuotaValue(limit, unit, basis),
  }
}

export function withCredits(formatted: string, unit: string, creditsLabel: string): string {
  return unit === "micros" ? `${formatted} ${creditsLabel}` : formatted
}
