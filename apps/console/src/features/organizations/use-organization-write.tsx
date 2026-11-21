import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useToast } from "@sb0rka/ui"
import { useAuth } from "@/features/auth/auth-provider"
import { EmailVerificationDialog } from "@/features/auth/email-verification-dialog"
import { ApiError } from "@/lib/api-client"

export function isOrganizationUnavailable(error: unknown) {
  return error instanceof ApiError && [400, 403, 404].includes(error.status)
}

function errorMessageKey(error: unknown) {
  if (!(error instanceof ApiError)) return "organizations.errors.save"
  if (/last owner/i.test(error.message)) return "organizations.errors.lastOwner"
  switch (error.status) {
    case 400: return "organizations.errors.invalid"
    case 403: return "organizations.errors.forbidden"
    case 404: return "organizations.errors.notFound"
    case 409: return "organizations.errors.conflict"
    default: return "organizations.errors.save"
  }
}

export function useOrganizationWrite() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showError } = useToast()
  const inFlight = useRef(false)
  const [isWriting, setIsWriting] = useState(false)
  const [verificationOpen, setVerificationOpen] = useState(false)

  async function run<T>(action: () => Promise<T>, handleError?: (error: unknown) => boolean) {
    if (inFlight.current || verificationOpen) return { ok: false } as const

    inFlight.current = true
    setIsWriting(true)
    try {
      return { ok: true, data: await action() } as const
    } catch (error) {
      if (error instanceof ApiError && error.status === 403 && /email verification required/i.test(error.message)) {
        setVerificationOpen(true)
      } else if (!handleError?.(error)) {
        showError(t(errorMessageKey(error)))
      }
      return { ok: false } as const
    } finally {
      inFlight.current = false
      setIsWriting(false)
    }
  }

  return {
    run,
    isWriting,
    verificationDialog: user && verificationOpen ? (
      <EmailVerificationDialog
        open
        userId={user.id}
        onClose={() => setVerificationOpen(false)}
        onVerified={() => setVerificationOpen(false)}
      />
    ) : null,
  }
}
