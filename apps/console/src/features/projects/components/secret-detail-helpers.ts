import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ApiError } from "@/lib/api-client"

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export function normalizeSecretDescription(value: string | undefined): string {
  const trimmed = value?.trim() ?? ""
  if (!trimmed || trimmed === "—") return ""
  return value ?? ""
}

export function useCopyHint() {
  const { t } = useTranslation()
  const [message, setMessage] = useState<string | null>(null)
  const timeoutRef = useRef<number | null>(null)

  const clear = useCallback(() => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setMessage(null)
  }, [])

  useEffect(() => clear, [clear])

  const copy = useCallback(
    async (text: string | undefined) => {
      if (!text) return
      const show = (next: string, durationMs: number) => {
        if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
        setMessage(next)
        timeoutRef.current = window.setTimeout(() => {
          setMessage(null)
          timeoutRef.current = null
        }, durationMs)
      }
      try {
        await navigator.clipboard.writeText(text)
        show(t("common.messages.copied"), 2000)
      } catch {
        show(t("common.messages.copyFailed"), 3000)
      }
    },
    [t],
  )

  return { message, copy, clear }
}
