import { useEffect, useRef, useState, type FormEvent } from "react"
import { useSearchParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  useToast,
} from "@sb0rka/ui"
import { ApiError } from "@/lib/api-client"
import type { TopUpLimits } from "../api"
import { useStartTopUp, useTopUpOrder } from "../hooks"

const wholeRubles = /^[1-9][0-9]*$/
const orderIDPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isBankPaymentURL(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.port === "" && url.pathname.length > 1
  } catch {
    return false
  }
}

function topUpErrorKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "subscription.topUpCapError"
    if (error.status === 429) return "subscription.topUpRateError"
    if (error.status === 400) return "subscription.topUpInvalid"
  }
  return "subscription.topUpError"
}

export function TopUpDialog({
  open,
  onOpenChange,
  limits,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  limits: TopUpLimits
}) {
  const { t } = useTranslation()
  const start = useStartTopUp()
  const [amount, setAmount] = useState("")
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const roomFits = limits.room_rub >= limits.min_rub
  const effectiveMax = Math.min(limits.max_rub, limits.room_rub)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setAmount("")
      setErrorKey(null)
    }
    onOpenChange(next)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!roomFits || start.isPending) return
    if (!wholeRubles.test(amount)) {
      setErrorKey("subscription.topUpInvalid")
      return
    }
    const rubles = Number(amount)
    if (!Number.isSafeInteger(rubles) || rubles < limits.min_rub || rubles > effectiveMax) {
      setErrorKey("subscription.topUpInvalid")
      return
    }
    setErrorKey(null)
    try {
      const result = await start.mutateAsync(rubles)
      if (!isBankPaymentURL(result.payment_url)) {
        setErrorKey("subscription.topUpError")
        return
      }
      window.location.assign(result.payment_url)
    } catch (error) {
      setErrorKey(topUpErrorKey(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} autoComplete="off">
          <DialogHeader>
            <DialogTitle>{t("subscription.topUpTitle")}</DialogTitle>
            <DialogDescription>{t("subscription.topUpDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-6 pb-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="topup-amount">{t("subscription.topUpAmount")}</Label>
              <Input
                id="topup-amount"
                name="amount"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                disabled={!roomFits || start.isPending}
                placeholder={t("subscription.topUpAmountPlaceholder", { min: limits.min_rub })}
                value={amount}
                onChange={(event) => setAmount(event.target.value.trim())}
              />
            </div>
            {errorKey ? (
              <p className="text-sm text-destructive">
                {t(errorKey, { min: limits.min_rub, max: limits.room_rub })}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={start.isPending}
            >
              {t("common.actions.cancel")}
            </Button>
            <Button type="submit" disabled={!roomFits || start.isPending || amount === ""}>
              {start.isPending ? t("subscription.topUpPending") : t("subscription.topUpSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function TopUpReturn() {
  const { t } = useTranslation()
  const { showSuccess, showError } = useToast()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const raw = params.get("order_id")
  const orderId = raw != null && orderIDPattern.test(raw) ? raw : null
  const order = useTopUpOrder(orderId)
  const shown = useRef(new Set<string>())
  const status = order.data?.status
  const amount = order.data?.amount_rub

  useEffect(() => {
    if (status === "confirmed" || status === "refunded") {
      void queryClient.invalidateQueries({ queryKey: ["subscription", "balance"] })
    }
  }, [status, queryClient])

  useEffect(() => {
    if (raw == null) return

    const clearOrder = () => {
      setParams((prev) => {
        if (!prev.has("order_id")) return prev
        const next = new URLSearchParams(prev)
        next.delete("order_id")
        return next
      }, { replace: true })
    }

    const once = (key: string) => {
      if (shown.current.has(key)) return false
      shown.current.add(key)
      return true
    }

    if (orderId == null) {
      if (!once(`invalid:${raw}`)) return
      showError(t("subscription.topUpReturnUnknown"))
      clearOrder()
      return
    }
    if (order.isPending && status == null) return
    if (status === "pending") {
      if (!once(`${orderId}:pending`)) return
      showSuccess(t("subscription.topUpReturnPending", { amount }))
      return
    }
    if (status === "confirmed") {
      if (!once(`${orderId}:confirmed`)) return
      showSuccess(t("subscription.topUpReturnConfirmed", { amount }))
      clearOrder()
      return
    }
    if (status === "failed") {
      if (!once(`${orderId}:failed`)) return
      showError(t("subscription.topUpReturnFailed", { amount }))
      clearOrder()
      return
    }
    if (status === "refunded") {
      if (!once(`${orderId}:refunded`)) return
      clearOrder()
      return
    }
    if (!once(`${orderId}:unknown`)) return
    showError(t("subscription.topUpReturnUnknown"))
    clearOrder()
  }, [
    amount,
    order.isPending,
    orderId,
    raw,
    setParams,
    showError,
    showSuccess,
    status,
    t,
  ])

  return null
}
