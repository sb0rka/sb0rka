import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Badge, Button } from "@sb0rka/ui"
import type { BalanceResponse, PlanResponse } from "../api"
import {
  accountBalanceEntries,
  displayCurrency,
  formatMoneyWithSign,
  localizedName,
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

const balanceRowClass = "flex w-fit max-w-full flex-wrap items-center gap-3"

function AccountDivider() {
  return <div className="hidden h-8 w-px bg-border sm:block" aria-hidden />
}

function TopUpButton() {
  const { t } = useTranslation()

  return (
    <span className="relative inline-flex">
      <Button type="button" variant="outline" disabled>
        {t("subscription.topUp")}
        <span className="sr-only">, {t("subscription.soon")}</span>
      </Button>
      <Badge
        variant="inactive"
        className="pointer-events-none absolute -right-1.5 -top-1.5 px-1 text-[10px]"
      >
        {t("subscription.soon")}
      </Badge>
    </span>
  )
}

function BalanceFigures({
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
    return (
      <>
        <AccountDivider />
        <div className={balanceRowClass}>
          <div aria-busy="true" className="h-8 w-24 animate-pulse rounded-md bg-muted" />
          <TopUpButton />
        </div>
      </>
    )
  }

  if (isError) {
    return (
      <>
        <AccountDivider />
        <div className={balanceRowClass}>
          <p className="text-sm text-destructive">{t("subscription.balanceError")}</p>
          <Button type="button" variant="outline" onClick={onRetry}>
            {t("subscription.retry")}
          </Button>
          <TopUpButton />
        </div>
      </>
    )
  }

  const figures = balanceFigures(balance, i18n.language)
  if (figures.length === 0) return null
  const showCode = figures.length > 1

  return (
    <>
      <AccountDivider />
      <div className={balanceRowClass}>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            {t("subscription.balanceTitle")}
          </span>
          {figures.map((figure) => (
            <span key={figure.code} className="inline-flex items-baseline gap-x-2">
              {showCode ? (
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  {figure.code}
                </span>
              ) : null}
              <span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                {figure.text}
              </span>
            </span>
          ))}
        </p>
        <TopUpButton />
      </div>
    </>
  )
}

export function PlanHeroCard({
  plan,
  balance,
  balanceLoading,
  balanceError,
  onBalanceRetry,
}: {
  plan: PlanResponse
  balance: BalanceResponse | null | undefined
  balanceLoading: boolean
  balanceError: boolean
  onBalanceRetry: () => void
}) {
  const { t, i18n } = useTranslation()

  return (
    <div
      id="subscription-balance"
      className="flex w-fit max-w-full flex-wrap items-center gap-x-6 gap-y-3 scroll-mt-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-2xl font-semibold tracking-tight text-foreground">
          {localizedName(plan, i18n.language)}
        </p>
        <Button asChild variant="outline">
          <Link to="/subscription/plans">{t("subscription.changePlan")}</Link>
        </Button>
      </div>
      <BalanceFigures
        balance={balance}
        isLoading={balanceLoading}
        isError={balanceError}
        onRetry={onBalanceRetry}
      />
    </div>
  )
}
