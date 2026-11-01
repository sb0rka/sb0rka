import { useTranslation } from "react-i18next"
import type { BalanceResponse } from "../api"
import type { ProjectQuotaView } from "../hooks"
import {
  accountBalanceEntries,
  balanceIsNearLimit,
  formatMoneyAmount,
  formatQuotaPair,
  formatQuotaValue,
  localizedName,
  withCredits,
  type QuotaRowView,
} from "../quota-format"

function scrollToTarget(id: string) {
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
  document.getElementById(id)?.scrollIntoView({ behavior, block: "start" })
}

interface AttentionEntry {
  key: string
  targetId: string
  projectId?: string
  context: string
  label: string
  detail: string
}

function quotaDetail(row: QuotaRowView, credits: string): string {
  const unit = row.usage?.unit || row.definition.unit
  if (row.usage?.status === "available" && row.usage.used != null) {
    const pair = formatQuotaPair(row.usage.used, row.effective, unit)
    return `${withCredits(pair.used, unit, credits)} / ${withCredits(pair.limit, unit, credits)}`
  }
  return withCredits(formatQuotaValue(row.effective, unit), unit, credits)
}

export function AttentionStrip({
  views,
  balance,
  ready,
  onSelectProject,
}: {
  views: ProjectQuotaView[]
  balance: BalanceResponse | null
  ready: boolean
  onSelectProject?: (projectId: string) => void
}) {
  const { t, i18n } = useTranslation()
  if (!ready) return null

  const credits = t("subscription.credits")
  const named = new Map<string, QuotaRowView>()
  for (const view of views) {
    for (const row of view.rows) {
      if (!named.has(row.code)) named.set(row.code, row)
    }
  }

  const entries: AttentionEntry[] = []
  for (const entry of accountBalanceEntries(balance)) {
    if (!balanceIsNearLimit(entry.balance)) continue
    const match = named.get(entry.code)
    const amount = formatMoneyAmount(entry.balance.available?.RUB)
    entries.push({
      key: `balance-${entry.code}`,
      targetId: "subscription-balance",
      context: t("subscription.balanceTitle"),
      label: match ? localizedName(match.definition, i18n.language) : entry.code,
      detail: amount ?? "—",
    })
  }

  for (const view of views) {
    for (const row of view.rows) {
      if (!row.nearLimit) continue
      entries.push({
        key: `${view.project.public_id}-${row.code}`,
        targetId: `subscription-project-${view.project.public_id}`,
        projectId: view.project.public_id,
        context: view.project.name,
        label: localizedName(row.definition, i18n.language),
        detail: quotaDetail(row, credits),
      })
    }
  }

  if (entries.length === 0) return null

  return (
    <section aria-label={t("subscription.attentionLabel")} className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-[#c75a48]">{t("subscription.attentionLabel")}</h2>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {entries.map((entry) => (
          <li key={entry.key} className="shrink-0">
            <button
              type="button"
              onClick={() => {
                if (entry.projectId && onSelectProject) {
                  onSelectProject(entry.projectId)
                  return
                }
                scrollToTarget(entry.targetId)
              }}
              className="flex min-w-[12rem] max-w-xs flex-col items-start border-y border-r border-border border-l-2 border-l-[#c75a48] bg-card px-3 py-2 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="max-w-full truncate text-xs text-muted-foreground">{entry.context}</span>
              <span className="max-w-full truncate text-sm font-medium">{entry.label}</span>
              <span className="text-sm tabular-nums">{entry.detail}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
