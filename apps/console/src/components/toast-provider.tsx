import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"
import { CheckCircle2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const TOAST_DURATION_MS = 4500

interface ToastContextValue {
  showSuccess: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [message, setMessage] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showSuccess = useCallback((next: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setMessage(next)
    timeoutRef.current = setTimeout(() => {
      setMessage(null)
      timeoutRef.current = null
    }, TOAST_DURATION_MS)
  }, [])

  const dismiss = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setMessage(null)
  }, [])

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    },
    []
  )

  const value = useMemo(() => ({ showSuccess }), [showSuccess])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message ? (
        <div
          className="fixed left-1/2 top-[calc(var(--app-header-height)+0.625rem+env(safe-area-inset-top,0px))] z-[100] w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2"
          aria-live="polite"
        >
          <div
            role="status"
            className={cn(
              "flex w-full items-start gap-3 overflow-hidden rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg"
            )}
          >
            <CheckCircle2
              className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden
            />
            <p className="min-w-0 flex-1 text-[13px] font-medium leading-5">{message}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={dismiss}
              aria-label={t("common.a11y.dismissToast")}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider")
  }
  return ctx
}
