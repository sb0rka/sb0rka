import { useState } from "react"
import { Link, Navigate, Outlet } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { AlphaToast, Button, ToastPinned } from "@sb0rka/ui"
import { useAuth } from "@/features/auth/auth-provider"
import { EmailVerificationDialog } from "@/features/auth/email-verification-dialog"
import { useQuickStartProgress } from "./progress"
import { useAccountEntry } from "./use-account-entry"

const ALPHA_UNDERSTOOD_KEY = "alpha-understood"

function AlphaNotice() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(() => {
    try {
      return !localStorage.getItem(ALPHA_UNDERSTOOD_KEY)
    } catch {
      return true
    }
  })

  if (!open) return null

  return (
    <ToastPinned>
      <AlphaToast
        className="w-full"
        title={t("app.alphaToastTitle")}
        description={t("app.alphaToastDescription")}
        actionLabel={t("app.alphaToastAction")}
        onAction={() => {
          try {
            localStorage.setItem(ALPHA_UNDERSTOOD_KEY, "1")
          } catch {
            /* ignore quota / private mode */
          }
          setOpen(false)
        }}
      />
    </ToastPinned>
  )
}

export function AccountEntryRoute() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const userId = user?.id ?? ""
  const entry = useAccountEntry(userId)
  const progress = useQuickStartProgress(userId)
  const stage = progress?.stage

  if (entry.failed) {
    const { refetch } = entry.failed
    return (
      <div className="flex flex-col items-start gap-3" role="alert">
        <p className="text-sm text-destructive">{t("quickStart.entryError")}</p>
        <Button variant="outline" onClick={() => void refetch()}>{t("subscription.retry")}</Button>
      </div>
    )
  }

  if (!entry.ready) {
    return (
      <>
        <div className="flex min-h-[500px] flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </div>
        {user && (
          <EmailVerificationDialog open={entry.verify} userId={user.id} onVerified={entry.verified} />
        )}
      </>
    )
  }

  if (entry.cloud && stage === "welcome") {
    return <Navigate to="/quick-start" replace />
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Outlet />
      {entry.cloud && (stage === "project" || stage === "key" || stage === "ready") && (
        <Button asChild variant="outline" className="self-start">
          <Link to="/quick-start">{t("quickStart.resume")}</Link>
        </Button>
      )}
      {!progress && <AlphaNotice />}
    </div>
  )
}
