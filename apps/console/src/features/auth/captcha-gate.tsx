import { useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  useTheme,
} from "@sb0rka/ui"
import { useTranslation } from "react-i18next"

const SCRIPT_ID = "ddg-captcha-api"
const CAPTCHA_SCRIPT_URL =
  "https://captcha.ddos-guard.net/static/api.js?render=explicit&onload=initCaptcha"

interface DdgCaptcha {
  ready: (callback: () => void) => void
  render: (
    container: string,
    parameters: {
      sitekey: string
      callback?: (token: string) => void
    },
  ) => string | number
  reset: (widgetId?: string | number) => void
  remove: (widgetId?: string | number) => void
}

declare global {
  interface Window {
    ddgcaptcha?: DdgCaptcha
    initCaptcha?: () => void
  }
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function applyTriggerStyle(slot: HTMLElement, isDark: boolean) {
  const bg = cssVar("--background")
  const border = cssVar("--border")
  const ring = cssVar("--ring")
  const statusBg = cssVar(isDark ? "--secondary" : "--primary")

  slot.setAttribute("data-ddg-trigger-radius", cssVar("--radius"))
  slot.setAttribute("data-ddg-trigger-bg", bg)
  slot.setAttribute("data-ddg-trigger-checkbox-bg", bg)
  slot.setAttribute("data-ddg-trigger-label-color", cssVar("--foreground"))
  slot.setAttribute("data-ddg-trigger-border", `1px solid ${border}`)
  slot.setAttribute("data-ddg-trigger-border-hover", ring)
  slot.setAttribute("data-ddg-trigger-checkbox-border", `1px solid ${border}`)
  slot.setAttribute("data-ddg-trigger-checkbox-border-hover", ring)
  slot.setAttribute("data-ddg-trigger-status-loading-bg", statusBg)
  slot.setAttribute("data-ddg-trigger-status-success-bg", statusBg)
}

interface CaptchaGateProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onVerified: (token: string) => void
  sitekey: string
}

export function CaptchaGate({ open, onOpenChange, onVerified, sitekey }: CaptchaGateProps) {
  const [status, setStatus] = useState("")
  const { t } = useTranslation()
  const widgetId = useRef<string | number | undefined>(undefined)
  const onVerifiedRef = useRef(onVerified)
  onVerifiedRef.current = onVerified
  const { resolvedAppearance } = useTheme()

  useEffect(() => {
    if (!open || !sitekey) return

    let cancelled = false
    setStatus(t("auth.captcha.loading"))

    const renderWidget = () => {
      window.ddgcaptcha?.ready(() => {
        if (cancelled) return
        const slot = document.getElementById("captcha-slot")
        if (!slot) return

        applyTriggerStyle(slot, resolvedAppearance === "dark")
        if (slot.dataset.captchaTheme === resolvedAppearance && slot.childElementCount > 0) {
          setStatus("")
          return
        }
        if (widgetId.current !== undefined) {
          window.ddgcaptcha?.remove(widgetId.current)
          widgetId.current = undefined
        }
        slot.replaceChildren()
        slot.dataset.captchaTheme = resolvedAppearance
        widgetId.current = window.ddgcaptcha?.render("captcha-slot", {
          sitekey,
          callback: (token) => {
            onVerifiedRef.current(token)
          },
        })
        setStatus("")
      })
    }

    window.initCaptcha = renderWidget

    const existing = document.getElementById(SCRIPT_ID)
    if (!existing) {
      const script = document.createElement("script")
      script.id = SCRIPT_ID
      script.src = CAPTCHA_SCRIPT_URL
      script.defer = true
      script.onerror = () => {
        script.remove()
        if (!cancelled) setStatus(t("auth.captcha.error"))
      }
      document.body.appendChild(script)
    } else if (window.ddgcaptcha) {
      requestAnimationFrame(renderWidget)
    }

    return () => {
      cancelled = true
      if (widgetId.current !== undefined) {
        try {
          window.ddgcaptcha?.remove(widgetId.current)
        } catch {
          // The old DOM container might have already been unmounted by Radix Dialog
        }
        widgetId.current = undefined
      }
    }
  }, [open, sitekey, resolvedAppearance, t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-fit">
        <DialogHeader>
          <DialogTitle>{t("auth.captcha.title")}</DialogTitle>
          <DialogDescription>{t("auth.captcha.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-2 px-6 pb-6">
          <div
            id="captcha-slot"
            className="overflow-hidden rounded-[var(--radius)] bg-background [color-scheme:light] dark:[color-scheme:dark] [&_iframe]:bg-background"
          />
          {status ? <p>{status}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
