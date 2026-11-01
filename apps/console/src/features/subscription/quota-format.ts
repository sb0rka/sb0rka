import type {
  BalanceResponse,
  MoneyAmounts,
  ProjectQuotaItem,
  ProjectUsageResponse,
  QuotaBalance,
  QuotaDefinitionSnippet,
  QuotaUsage,
} from "./api"

const NEAR_LIMIT_RATIO = 0.9
const WARNING_RATIO = 0.7
const TOGGLE_USAGE_RATIO = 0.7

const TOGGLE_PINNED_CODES = new Set([
  "dbis.count",
  "dbis.storage.bytes",
  "projects.members.count",
  "secrets.count",
])

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

export function shortQuotaName(
  row: Pick<QuotaRowView, "code" | "definition">,
  language: string,
  t: (key: string) => string,
  group: "quotaShort" | "quotaLabel" = "quotaShort",
): string {
  const key = `subscription.${group}.${row.code}`
  const translated = t(key)
  if (translated && translated !== key) return translated
  return localizedName(row.definition, language)
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

export function toggleSummaryRows(rows: QuotaRowView[]): QuotaRowView[] {
  return rows.filter(
    (row) => TOGGLE_PINNED_CODES.has(row.code) || (row.ratio != null && row.ratio > TOGGLE_USAGE_RATIO),
  )
}

export function windowLabelKey(window: string | null | undefined): QuotaWindow | null {
  if (window && (WINDOWS as readonly string[]).includes(window)) {
    return window as QuotaWindow
  }
  return null
}

export interface AccountBalanceEntry {
  code: string
  balance: QuotaBalance
}

const DISPLAY_CURRENCIES = ["RUB", "USD"] as const
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number]

export function accountBalanceEntries(
  response: BalanceResponse | null | undefined,
): AccountBalanceEntry[] {
  if (!response || !Array.isArray(response.balances)) return []
  const entries: AccountBalanceEntry[] = []
  for (const item of response.balances) {
    if (!item || typeof item !== "object") continue
    for (const [code, balance] of Object.entries(item)) {
      if (!balance || typeof balance.available !== "object" || balance.available == null) continue
      entries.push({ code, balance })
    }
  }
  return entries.sort((left, right) => left.code.localeCompare(right.code))
}

export function moneyNumber(
  amounts: MoneyAmounts | undefined,
  currency: DisplayCurrency,
): number | null {
  const raw = amounts?.[currency]
  if (typeof raw !== "string" || raw.trim() === "") return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export function balanceConsumedRatio(balance: QuotaBalance): number | null {
  const used = moneyNumber(balance.used, "RUB")
  const held = moneyNumber(balance.held, "RUB") ?? 0
  const limit = moneyNumber(balance.limit, "RUB")
  const entitled = moneyNumber(balance.entitled, "RUB") ?? 0
  if (used == null || limit == null) return null
  return usageRatio(used + held, effectiveLimit(limit, entitled))
}

export function balanceIsNearLimit(balance: QuotaBalance): boolean {
  const available = moneyNumber(balance.available, "RUB")
  const limit = moneyNumber(balance.limit, "RUB")
  const entitled = moneyNumber(balance.entitled, "RUB") ?? 0
  if (available == null || limit == null) return false
  const cap = effectiveLimit(limit, entitled)
  if (cap > 0 && available <= 0) return true
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

export function formatMoneyAmount(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  if (Number.isInteger(value)) return groupInteger(value)
  const sign = value < 0 ? "−" : ""
  const [whole, frac] = Math.abs(value).toFixed(2).split(".")
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f")
  return `${sign}${grouped}.${frac}`
}

/** USD only when the UI is not Russian and the USD amount is a real number. */
export function displayCurrency(
  amounts: MoneyAmounts | undefined,
  language: string,
): DisplayCurrency {
  if (!language.startsWith("ru") && moneyNumber(amounts, "USD") != null) return "USD"
  return "RUB"
}

export function formatMoneyWithSign(
  amounts: MoneyAmounts | undefined,
  currency: DisplayCurrency,
): string | null {
  const text = formatMoneyAmount(amounts?.[currency])
  if (!text) return null
  if (currency === "USD") {
    if (text.startsWith("−")) return `−$${text.slice(1)}`
    return `$${text}`
  }
  return `${text}\u00a0₽`
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
