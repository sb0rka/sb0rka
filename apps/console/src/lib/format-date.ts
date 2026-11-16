function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateParts(date: Date): string {
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`
}

function formatTimeParts(date: Date, withSeconds = true): string {
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  return withSeconds ? `${time}:${pad2(date.getSeconds())}` : time
}

/** Local datetime as `DD-MM-YYYY HH:mm:ss` (no comma). */
export function formatDateTime(
  value: string | undefined | null,
  empty = "—",
): string {
  const date = parseDate(value)
  if (!date) return empty
  return `${formatDateParts(date)} ${formatTimeParts(date)}`
}

/** Local date as `DD-MM-YYYY`. */
export function formatDateOnly(
  value: string | undefined | null,
  empty = "—",
): string {
  const date = parseDate(value)
  if (!date) return empty
  return formatDateParts(date)
}

/** Compact axis/range label as `DD-MM HH:mm`. */
export function formatDateTimeShort(
  value: string | number | undefined | null,
  empty = "—",
): string {
  if (value == null || value === "") return empty
  const date = typeof value === "number" ? new Date(value) : parseDate(value)
  if (!date || Number.isNaN(date.getTime())) return empty
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)} ${formatTimeParts(date, false)}`
}

/** Compact day-month label as `DD-MM`. */
export function formatDayMonth(
  value: string | number | undefined | null,
  empty = "—",
): string {
  if (value == null || value === "") return empty
  const date = typeof value === "number" ? new Date(value) : parseDate(value)
  if (!date || Number.isNaN(date.getTime())) return empty
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}`
}

/** Local time as `HH:mm`. */
export function formatTimeOnly(
  value: string | number | undefined | null,
  empty = "—",
): string {
  if (value == null || value === "") return empty
  const date = typeof value === "number" ? new Date(value) : parseDate(value)
  if (!date || Number.isNaN(date.getTime())) return empty
  return formatTimeParts(date, false)
}
