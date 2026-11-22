import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge, Button } from "@sb0rka/ui"
import { useTopUpLimits } from "../hooks"
import { TopUpDialog } from "./top-up-dialog"

const SALES_EMAIL = "sales@sb0rka.ru"

export function CorporateBillingContact() {
  const { t } = useTranslation()
  return (
    <p className="min-w-0 text-sm text-muted-foreground">
      {t("subscription.receiptsCorporate")}{" "}
      <a href={`mailto:${SALES_EMAIL}`} className="font-medium text-foreground underline-offset-4 hover:underline">
        {SALES_EMAIL}
      </a>
    </p>
  )
}

export function TopUpButton({ label }: { label?: string }) {
  const { t } = useTranslation()
  const text = label ?? t("subscription.topUp")
  const limits = useTopUpLimits()
  const [open, setOpen] = useState(false)

  if (limits.data?.enabled) {
    return (
      <>
        <Button type="button" onClick={() => setOpen(true)}>{text}</Button>
        <TopUpDialog open={open} onOpenChange={setOpen} limits={limits.data} />
      </>
    )
  }

  const soon = !limits.isPending
  return (
    <span className="relative inline-flex shrink-0">
      <Button type="button" disabled>
        {text}
        {soon && <span className="sr-only">, {t("subscription.soon")}</span>}
      </Button>
      {soon && <Badge variant="inactive" className="pointer-events-none absolute -right-2 -top-2 px-1.5">
        {t("subscription.soon")}
      </Badge>}
    </span>
  )
}
