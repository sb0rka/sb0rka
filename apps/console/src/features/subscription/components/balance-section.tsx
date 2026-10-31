import { useTranslation } from "react-i18next"
import { Badge, Button, Tooltip, TooltipContent, TooltipTrigger } from "@sb0rka/ui"
import { Progress } from "@/components/ui/progress"
import type { BalanceResponse, QuotaBalance } from "../api"
import {
  effectiveLimit,
  formatQuotaValue,
  localizedName,
  withCredits,
  type QuotaRowView,
} from "../quota-format"

function Amount({
  value,
  unit,
  credits,
  basis,
}: {
  value: number
  unit: string
  credits: string
  basis?: number
}) {
  return <>{withCredits(formatQuotaValue(value, unit, basis), unit, credits)}</>
}

function BalanceCard({
  code,
  balance,
  label,
  unit,
}: {
  code: string
  balance: QuotaBalance
  label: string
  unit: string
}) {
  const { t } = useTranslation()
  const credits = t("subscription.credits")
  const cap = effectiveLimit(balance.limit, balance.entitled)
  const basis = Math.max(cap, balance.used, balance.held, balance.available)

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{label}</h3>
          {code !== label ? (
            <p className="font-mono text-xs text-muted-foreground">{code}</p>
          ) : null}
        </div>
        {balance.entitled > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="inactive" className="shrink-0 px-1.5">
                {t("subscription.bonus", {
                  value: withCredits(formatQuotaValue(balance.entitled, unit, basis), unit, credits),
                })}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{t("subscription.bonusHint")}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <p className="text-3xl font-semibold tabular-nums tracking-tight">
        <Amount value={balance.available} unit={unit} credits={credits} basis={basis} />
      </p>
      <p className="text-xs text-muted-foreground">{t("subscription.available")}</p>
      <Progress
        mode="stack"
        label={label}
        max={cap}
        segments={[
          { value: balance.used, tone: "used" },
          { value: balance.held, tone: "held" },
          { value: balance.available, tone: "available" },
        ]}
      />
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">{t("subscription.used")}</dt>
          <dd className="tabular-nums">
            <Amount value={balance.used} unit={unit} credits={credits} basis={basis} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="underline decoration-dotted underline-offset-2">{t("subscription.held")}</span>
              </TooltipTrigger>
              <TooltipContent>{t("subscription.heldHint")}</TooltipContent>
            </Tooltip>
          </dt>
          <dd className="tabular-nums">
            <Amount value={balance.held} unit={unit} credits={credits} basis={basis} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("subscription.available")}</dt>
          <dd className="tabular-nums">
            <Amount value={balance.available} unit={unit} credits={credits} basis={basis} />
          </dd>
        </div>
      </dl>
    </article>
  )
}

export function BalanceSection({
  balance,
  rows,
  isLoading,
  isError,
  onRetry,
}: {
  balance: BalanceResponse | null | undefined
  rows: QuotaRowView[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}) {
  const { t, i18n } = useTranslation()

  if (isLoading) {
    return (
      <section aria-busy="true" className="h-28 animate-pulse rounded-lg bg-muted" />
    )
  }

  if (isError) {
    return (
      <section id="subscription-balance" className="scroll-mt-4 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-destructive">{t("subscription.balanceError")}</p>
          <Button type="button" variant="outline" onClick={onRetry}>
            {t("subscription.retry")}
          </Button>
        </div>
      </section>
    )
  }

  if (!balance) return null
  const entries = Object.entries(balance).sort(([left], [right]) => left.localeCompare(right))
  if (entries.length === 0) return null

  return (
    <section id="subscription-balance" className="scroll-mt-4 flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("subscription.balanceTitle")}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {entries.map(([code, item]) => {
          const match = rows.find((row) => row.code === code)
          const unit = match?.definition.unit ?? "count"
          const label = match ? localizedName(match.definition, i18n.language) : code
          return (
            <BalanceCard
              key={code}
              code={code}
              balance={item}
              label={label}
              unit={unit}
            />
          )
        })}
      </div>
    </section>
  )
}
