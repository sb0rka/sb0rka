import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Badge, Button } from "@sb0rka/ui"
import type { BalanceResponse } from "../api"
import {
  accountBalanceEntries,
  displayCurrency,
  formatMoneyWithSign,
} from "../quota-format"

interface BalanceFigure {
  code: string
  text: string
}

function balanceFigures(
  balance: BalanceResponse | null | undefined,
  language: string,
): BalanceFigure[] {
  return accountBalanceEntries(balance).map((entry) => {
    const currency = displayCurrency(entry.balance.available, language)
    return {
      code: entry.code,
      text: formatMoneyWithSign(entry.balance.available, currency) ?? "—",
    }
  })
}

const cellClass = "flex min-w-0 flex-col gap-2 px-5 py-3.5"
const labelClass = "text-sm font-medium text-muted-foreground"
const cellBodyClass = "flex flex-wrap items-end justify-between gap-3"
const nameClass = "text-lg font-semibold text-foreground"
const valueClass = "text-sm font-semibold text-foreground"

function TopUpButton() {
  const { t } = useTranslation()

  return (
    <span className="relative inline-flex shrink-0">
      <Button type="button" variant="outline" disabled>
        {t("subscription.topUp")}
        <span className="sr-only">, {t("subscription.soon")}</span>
      </Button>
      <Badge variant="inactive" className="pointer-events-none absolute -right-2 -top-2 px-1.5">
        {t("subscription.soon")}
      </Badge>
    </span>
  )
}

function BalanceValue({
  balance,
  isLoading,
  isError,
  onRetry,
}: {
  balance: BalanceResponse | null | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
}) {
  const { t, i18n } = useTranslation()

  if (isLoading) {
    return <div aria-busy="true" className="h-7 w-20 animate-pulse rounded-md bg-muted" />
  }

  if (isError) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-destructive">{t("subscription.balanceError")}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {t("subscription.retry")}
        </Button>
      </div>
    )
  }

  const figures = balanceFigures(balance, i18n.language)
  if (figures.length === 0) return <p className={valueClass}>—</p>
  const showCode = figures.length > 1

  return (
    <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      {figures.map((figure) => (
        <span key={figure.code} className="inline-flex items-baseline gap-x-2">
          {showCode ? (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-muted-foreground">
              {figure.code}
            </span>
          ) : null}
          <span className={`${valueClass} tabular-nums`}>{figure.text}</span>
        </span>
      ))}
    </p>
  )
}

export function AccountSummary({
  planName,
  balance,
  balanceLoading,
  balanceError,
  onBalanceRetry,
}: {
  planName: string
  balance: BalanceResponse | null | undefined
  balanceLoading: boolean
  balanceError: boolean
  onBalanceRetry: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-1 divide-y divide-border rounded-lg border border-border md:grid-cols-2 md:divide-x md:divide-y-0">
      <section className={cellClass} aria-labelledby="subscription-plan-label">
        <h2 id="subscription-plan-label" className={labelClass}>
          {t("subscription.planLabel")}
        </h2>
        <div className={cellBodyClass}>
          <p className={`${nameClass} min-w-0 truncate`}>{planName}</p>
          <Button asChild>
            <Link to="/subscription/plans">{t("subscription.changePlan")}</Link>
          </Button>
        </div>
      </section>
      <section
        id="subscription-balance"
        className={`${cellClass} scroll-mt-4`}
        aria-labelledby="subscription-balance-label"
      >
        <h2 id="subscription-balance-label" className={labelClass}>
          {t("subscription.balanceTitle")}
        </h2>
        <div className={cellBodyClass}>
          <BalanceValue
            balance={balance}
            isLoading={balanceLoading}
            isError={balanceError}
            onRetry={onBalanceRetry}
          />
          <TopUpButton />
        </div>
      </section>
    </div>
  )
}
