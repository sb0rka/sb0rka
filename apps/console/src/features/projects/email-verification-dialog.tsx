import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { verifyEmailConfirm, verifyEmailSend } from "../auth/api"
import { OtpInput } from "@/components/ui/otp-input"
import { ApiError } from "@/lib/api-client"

const RESEND_COOLDOWN_SECONDS = 60

interface StoredVerification {
  verification_id: string
  timestamp: number
  expires_at: string
}

function getStorageKey(userId: string) {
  return `email-verification-${userId}`
}

function clearEmailVerificationStorage(userId: string) {
  localStorage.removeItem(getStorageKey(userId))
}

function readStoredVerification(
  userId: string,
): { verificationId: string; timestamp: number; expiresAtMs: number } | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(getStorageKey(userId))
  } catch {
    return null
  }

  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<StoredVerification>
    if (
      typeof parsed.verification_id !== "string" ||
      typeof parsed.timestamp !== "number" ||
      typeof parsed.expires_at !== "string"
    )
      return null

    const expiresAtMs = new Date(parsed.expires_at).getTime()
    if (Number.isNaN(expiresAtMs)) return null

    return {
      verificationId: parsed.verification_id,
      timestamp: parsed.timestamp,
      expiresAtMs,
    }
  } catch {
    return null
  }
}

interface ConfirmEmailDialogProps {
  open: boolean
  userId: string
  onVerified: () => void | Promise<void>
}

export function EmailVerificationDialog({
  open,
  userId,
  onVerified,
}: ConfirmEmailDialogProps) {
  const [verificationId, setVerificationId] = useState<string | null>(null)
  const [code, setCode] = useState<string[]>(Array(6).fill(""))
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const { t } = useTranslation()

  const sendInFlightRef = useRef(false)

  const sendCode = useCallback(async () => {
    if (sendInFlightRef.current) return

    sendInFlightRef.current = true
    setSending(true)
    setError(null)

    try {
      const { verification_id, expires_at } = await verifyEmailSend()
      setVerificationId(verification_id)
      setCode(Array(6).fill(""))
      setCooldown(RESEND_COOLDOWN_SECONDS)
      localStorage.setItem(
        getStorageKey(userId),
        JSON.stringify({ timestamp: Date.now(), verification_id, expires_at }),
      )
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError(t("auth.emailVerification.errorTooManyRequests"))
      } else {
        setError(t("auth.emailVerification.errorSendFailed"))
      }
    } finally {
      setSending(false)
      sendInFlightRef.current = false
    }
  }, [t, userId])

  async function handleVerify(fullCode: string) {
    if (!verificationId) return
    setVerifying(true)
    setError(null)
    try {
      await verifyEmailConfirm(verificationId, fullCode)
      clearEmailVerificationStorage(userId)
      await onVerified()
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError(t("auth.emailVerification.errorInvalidCode"))
      } else {
        setError(t("auth.emailVerification.errorGeneric"))
      }
      setCode(Array(6).fill(""))
    } finally {
      setVerifying(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setError(null)

    const stored = readStoredVerification(userId)
    const now = Date.now()

    if (stored && new Date(stored.expiresAtMs).getTime() > now) {
      setVerificationId(stored.verificationId)
      setCode(Array(6).fill(""))
      const elapsedSeconds = Math.floor((now - stored.timestamp) / 1000)
      setCooldown(Math.max(0, RESEND_COOLDOWN_SECONDS - elapsedSeconds))
      return
    }

    setVerificationId(null)
    setCode(Array(6).fill(""))
    if (stored) {
      const elapsedSeconds = Math.floor((now - stored.timestamp) / 1000)
      setCooldown(Math.max(0, RESEND_COOLDOWN_SECONDS - elapsedSeconds))
    } else {
      setCooldown(0)
      sendCode()
    }
  }, [open, sendCode, userId])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  return (
    <Dialog open={open}>
      <DialogContent
        className="gap-0 p-0 shadow-sm"
        hideCloseButton
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <>
          <DialogHeader className="p-6 text-start">
            <DialogTitle>{t("auth.emailVerification.title")}</DialogTitle>
            <DialogDescription>
              {sending && !verificationId
                ? t("auth.emailVerification.descriptionSending")
                : t("auth.emailVerification.descriptionWaiting")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-6 pb-6">
            <OtpInput
              length={6}
              value={code}
              onChange={(next) => {
                setError(null)
                setCode(next)
              }}
              onComplete={handleVerify}
              disabled={verifying || sending || !verificationId}
              error={error}
            />
            {error && <p className="text-center text-destructive text-sm">{error}</p>}
          </div>
          <DialogFooter className="min-h-16 items-center pb-6 pt-0 justify-center">
            <Button
              variant="link"
              onClick={sendCode}
              disabled={sending || verifying || cooldown > 0}
            >
              {cooldown > 0
                ? t("auth.emailVerification.resendButtonCooldown", { seconds: cooldown })
                : t("auth.emailVerification.resendButton")}
            </Button>
          </DialogFooter>
        </>
      </DialogContent>
    </Dialog>
  )
}
