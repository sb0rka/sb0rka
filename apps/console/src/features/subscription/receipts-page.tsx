import { useTranslation } from "react-i18next"
import { Badge, Button, Card, CardContent, cn } from "@sb0rka/ui"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import { formatDateTime } from "@/lib/format-date"
import { rublesFromKopecks, type TopUpOrder } from "./api"
import { ASSEMBLY_MIN_VISIBLE_MS, AssemblingLoader, useMinimumVisible } from "./components/assembling.tsx"
import { usePayments } from "./hooks"

const statuses = ["pending", "confirmed", "failed", "refunded"] as const

type PaymentStatus = (typeof statuses)[number]

const RECEIPTS_TABLE_COLUMNS =
  "md:grid-cols-[minmax(max-content,1.25fr)_minmax(max-content,0.8fr)_minmax(max-content,0.9fr)_minmax(max-content,1.35fr)_minmax(max-content,0.85fr)]"

function isPaymentStatus(status: string): status is PaymentStatus {
  return statuses.some((item) => item === status)
}

function statusVariant(status: string) {
  switch (status) {
    case "confirmed":
      return "active" as const
    case "failed":
      return "destructive" as const
    case "refunded":
      return "default" as const
    default:
      return "inactive" as const
  }
}

function ReceiptsHeaderCell({ label }: { label: string }) {
  return (
    <div className="flex h-12 min-w-0 items-center justify-center px-4 text-center text-sm font-medium text-muted-foreground">
      <span className="truncate">{label}</span>
    </div>
  )
}

function ReceiptsRow({ item, isLastRow }: { item: TopUpOrder; isLastRow: boolean }) {
  const { t } = useTranslation()
  const statusLabel = isPaymentStatus(item.status)
    ? t(`subscription.receiptsStatus.${item.status}`)
    : item.status
  const hasReceipt = Boolean(item.receipt_url || item.refund_receipt_url)

  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 overflow-hidden py-3",
        "[grid-template-areas:'date_status'_'amount_amount'_'payment_payment'_'receipt_receipt']",
        "md:col-span-full md:grid-cols-subgrid md:items-stretch md:gap-0 md:overflow-visible md:py-0 md:[grid-template-areas:none]",
        !isLastRow && "border-b border-border",
      )}
    >
      <p className="min-w-0 truncate text-sm text-foreground [grid-area:date] md:flex md:min-h-14 md:items-center md:justify-center md:px-4 md:py-4 md:text-center md:[grid-area:auto]">
        {formatDateTime(item.created_at)}
      </p>
      <p className="min-w-0 whitespace-nowrap text-sm tabular-nums text-foreground [grid-area:amount] md:flex md:min-h-14 md:items-center md:justify-center md:px-4 md:py-4 md:text-center md:[grid-area:auto]">
        {rublesFromKopecks(item.amount_kopecks)} ₽
      </p>
      <div className="flex min-w-0 justify-end [grid-area:status] md:min-h-14 md:items-center md:justify-center md:px-4 md:py-4 md:[grid-area:auto]">
        <Badge variant={statusVariant(item.status)} className="w-fit shrink-0">
          {statusLabel}
        </Badge>
      </div>
      <p
        className="min-w-0 truncate font-mono text-xs text-foreground [grid-area:payment] md:flex md:min-h-14 md:items-center md:justify-center md:px-4 md:py-4 md:text-center md:[grid-area:auto]"
        title={item.provider_transaction_id || undefined}
      >
        {item.provider_transaction_id || "—"}
      </p>
      <div className="min-w-0 text-sm text-foreground [grid-area:receipt] md:flex md:min-h-14 md:items-center md:justify-center md:px-4 md:py-4 md:text-center md:[grid-area:auto]">
        {hasReceipt ? (
          <span className="flex flex-wrap gap-3">
            {item.receipt_url ? (
              <a
                href={item.receipt_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {t("subscription.receiptsOpen")}
              </a>
            ) : null}
            {item.refund_receipt_url ? (
              <a
                href={item.refund_receipt_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {t("subscription.receiptsOpenRefund")}
              </a>
            ) : null}
          </span>
        ) : (
          "—"
        )}
      </div>
    </div>
  )
}

function ReceiptsTable({ items }: { items: TopUpOrder[] }) {
  const { t } = useTranslation()

  return (
    <div className="w-full min-w-0 md:overflow-x-auto">
      <div className={cn("w-full", RECEIPTS_TABLE_COLUMNS, "md:grid")}>
        <div className="col-span-full hidden grid-cols-subgrid border-b border-border md:grid">
          <ReceiptsHeaderCell label={t("subscription.receiptsColumnDate")} />
          <ReceiptsHeaderCell label={t("subscription.receiptsColumnAmount")} />
          <ReceiptsHeaderCell label={t("subscription.receiptsColumnStatus")} />
          <ReceiptsHeaderCell label={t("subscription.receiptsColumnPayment")} />
          <ReceiptsHeaderCell label={t("subscription.receiptsColumnReceipt")} />
        </div>
        {items.map((item, index) => (
          <ReceiptsRow
            key={item.order_id}
            item={item}
            isLastRow={index === items.length - 1}
          />
        ))}
      </div>
    </div>
  )
}

export function ReceiptsPage() {
  const { t } = useTranslation()
  const payments = usePayments()
  const showAssembling = useMinimumVisible(payments.isPending, ASSEMBLY_MIN_VISIBLE_MS)
  const items = (payments.data?.pages ?? []).flatMap((page) => page?.items ?? [])

  return (
    <PageStagger className="flex min-h-0 flex-1 flex-col gap-6">
      <SlideIn>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">{t("subscription.receiptsTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("subscription.receiptsDescription")}</p>
        </div>
      </SlideIn>
      <SlideIn className="flex min-h-0 flex-1 flex-col">
        {showAssembling ? (
          <AssemblingLoader className="min-h-0 flex-1 py-0" />
        ) : (
          <Card>
            <CardContent className={cn("pt-6", payments.hasNextPage ? "pb-6" : "pb-2")}>
                {payments.isError ? (
                  <div className="flex flex-col items-start gap-3 pb-4">
                    <p className="text-sm text-destructive">{t("subscription.loadError")}</p>
                    <Button type="button" variant="outline" onClick={() => void payments.refetch()}>
                      {t("subscription.retry")}
                    </Button>
                  </div>
                ) : items.length === 0 ? (
                  <p className="pb-4 text-sm text-muted-foreground">{t("subscription.receiptsEmpty")}</p>
                ) : (
                  <div className="flex flex-col items-start gap-4">
                    <ReceiptsTable items={items} />
                    {payments.hasNextPage ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={payments.isFetchingNextPage}
                        onClick={() => void payments.fetchNextPage()}
                      >
                        {t("subscription.receiptsMore")}
                      </Button>
                    ) : null}
                  </div>
                )}
            </CardContent>
          </Card>
        )}
      </SlideIn>
    </PageStagger>
  )
}
