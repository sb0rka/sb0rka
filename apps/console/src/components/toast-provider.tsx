import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"
import { CheckCircle2, CircleAlert, CircleX, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const TOAST_DURATION_MS = 4500
const ERROR_TOAST_DURATION_MS = 6000

type ToastType = "success" | "error" | "warning"

interface ToastItem {
  id: number,
  type: ToastType
  message: string,
}

interface ToastContextValue {
  showSuccess: (message: string) => void
  showError: (message: string) => void
  showWarning: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    const timeout = timeoutsRef.current.get(id)
    if (timeout) {
      clearTimeout(timeout)
      timeoutsRef.current.delete(id)
    }
    setToasts((prev) => prev.filter(toast => toast.id !== id))
  }, [])

  const show = useCallback(
    (type: ToastType, message: string) => {
      const id = idRef.current++
      setToasts(prev => [...prev, { id, type, message }])
      const duration = type === "error" ? ERROR_TOAST_DURATION_MS : TOAST_DURATION_MS
      const timeout = setTimeout(() => dismiss(id), duration)
      timeoutsRef.current.set(id, timeout)
    }, [dismiss])

  const showSuccess = useCallback((message: string) => show("success", message), [show])
  const showError = useCallback((message: string) => show("error", message), [show])
  const showWarning = useCallback((message: string) => show("warning", message), [show])

  const value = useMemo(() => ({ showSuccess, showError, showWarning }), [showSuccess, showError, showWarning])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="flex flex-col gap-2 fixed left-1/2 top-[calc(var(--app-header-height)+0.625rem+env(safe-area-inset-top,0px))] z-[100] w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2"
        aria-live="polite"
      >
        {toasts.map(toast =>
          <div
            key={toast.id}
            role="status"
            className={cn(
              "flex w-full items-center gap-3 overflow-hidden rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg"
            )}
          >
            {toast.type === "success" &&
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />}
            {toast.type === "error" &&
              <CircleX
                className="mt-0.5 size-4 shrink-0 text-destructive"
                aria-hidden
              />}
            {toast.type === "warning" &&
              <CircleAlert
                className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />}
            <p className="min-w-0 flex-1 text-[13px] font-medium leading-5">{toast.message}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => dismiss(toast.id)}
              aria-label={t("common.a11y.dismissToast")}
            >
              <X className="size-4" />
            </Button>
          </div>
        )}
      </div>
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
