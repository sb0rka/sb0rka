import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { CheckCircle2, CircleAlert, CircleX } from "lucide-react"
import { cn } from "@/lib/utils"
import { CloseButton } from "./ui/close-button"

const TOAST_DURATION_MS = 4500
const STACK_OFFSET_PX = 8
const STACK_MAX_LAYERS = 2
const STUCK_EPSILON_PX = 0.5
const Z_FLOATING = 100

type StuckEdge = "top" | "bottom" | null

function useStackedToasts(
  containerRef: RefObject<HTMLDivElement | null>,
  count: number,
) {
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    let frame = 0

    const update = () => {
      frame = 0
      const items = Array.from(container.children) as HTMLElement[]
      const total = items.length
      const viewHeight = container.clientHeight
      const scrollTop = container.scrollTop
      const css = getComputedStyle(container)
      const gap = parseFloat(css.rowGap) || 0

      let cursor = parseFloat(css.paddingTop) || 0
      const natural = items.map((el) => {
        const top = cursor - scrollTop
        cursor += el.offsetHeight + gap
        return { top, bottom: top + el.offsetHeight }
      })

      const states = natural.map(({ top, bottom }, index): StuckEdge => {
        const topThreshold =
          Math.min(index, STACK_MAX_LAYERS) * STACK_OFFSET_PX
        const bottomThreshold =
          Math.min(total - 1 - index, STACK_MAX_LAYERS) * STACK_OFFSET_PX

        if (top <= topThreshold + STUCK_EPSILON_PX) return "top"
        if (bottom >= viewHeight - bottomThreshold - STUCK_EPSILON_PX) {
          return "bottom"
        }
        return null
      })

      const frontTop = states.lastIndexOf("top")
      const frontBottom = states.indexOf("bottom")
      const topLayers = Math.min(Math.max(frontTop, 0), STACK_MAX_LAYERS)
      const bottomLayers =
        frontBottom === -1
          ? 0
          : Math.min(total - 1 - frontBottom, STACK_MAX_LAYERS)

      items.forEach((el, index) => {
        const edge = states[index]

        let topPx = Math.min(index, STACK_MAX_LAYERS) * STACK_OFFSET_PX
        let bottomPx =
          Math.min(total - 1 - index, STACK_MAX_LAYERS) * STACK_OFFSET_PX
        let z = Z_FLOATING
        let depth = -1

        if (edge === "top") {
          depth = frontTop - index
          topPx = Math.max(topLayers - depth, 0) * STACK_OFFSET_PX
          z = index
        } else if (edge === "bottom") {
          depth = index - frontBottom
          bottomPx = Math.max(bottomLayers - depth, 0) * STACK_OFFSET_PX
          z = total - index
        }

        el.style.top = `${topPx}px`
        el.style.bottom = `${bottomPx}px`
        el.style.zIndex = String(z)

        if (edge) {
          el.dataset.stuck = edge
          el.dataset.depth = String(Math.min(depth, 2))
        } else {
          delete el.dataset.stuck
          delete el.dataset.depth
        }
      })
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    update()
    container.addEventListener("scroll", schedule, { passive: true })
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(container)

    return () => {
      container.removeEventListener("scroll", schedule)
      resizeObserver.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [containerRef, count])
}

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
const PinnedToastContext = createContext<HTMLElement | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  useStackedToasts(containerRef, toasts.length)
  const timeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const [pinnedToast, setPinnedToast] = useState<HTMLDivElement | null>(null)

  const dismiss = useCallback((id: number) => {
    const timeout = timeoutsRef.current.get(id)
    if (timeout) {
      clearTimeout(timeout)
      timeoutsRef.current.delete(id)
    }
    setToasts((prev) => prev.filter(toast => toast.id !== id))
  }, [])

  const show = useCallback(
    (type: ToastType, message: string, isPersistent = false) => {
      const id = idRef.current++
      setToasts(prev => [...prev, { id, type, message }])
      if (isPersistent) return
      const timeout = setTimeout(() => dismiss(id), TOAST_DURATION_MS)
      timeoutsRef.current.set(id, timeout)
    }, [dismiss])

  const showSuccess = useCallback((message: string) => show("success", message), [show])
  const showError = useCallback((message: string) => show("error", message, true), [show])
  const showWarning = useCallback((message: string) => show("warning", message), [show])

  const value = useMemo(() => ({ showSuccess, showError, showWarning }), [showSuccess, showError, showWarning])

  return (
    <ToastContext.Provider value={value}>
      <PinnedToastContext.Provider value={pinnedToast}>
        {children}
        <div
          className={cn(
            "pointer-events-none fixed z-[100] flex flex-col gap-2",
            "inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))]",
            "max-h-[calc(100dvh-var(--app-header-height)-5.75rem-env(safe-area-inset-bottom)-env(safe-area-inset-top,0px)-0.75rem)]",
            "md:inset-x-auto md:bottom-[10px] md:right-[10px] md:w-full md:max-w-[400px]",
            "md:max-h-[calc(100dvh-var(--app-header-height)-env(safe-area-inset-top,0px)-1.25rem)]",
          )}
        >
          {toasts.length > 0 && (
            <div
              ref={containerRef}
              aria-live="polite"
              className={cn(
                "pointer-events-auto flex max-h-[20dvh] w-full flex-auto flex-col gap-2 md:max-h-[35dvh]",
                "overflow-y-auto overscroll-contain [scrollbar-width:none]",
              )}
            >
              {toasts.map(toast => (
                <div
                  key={toast.id}
                  role="status"
                  className={cn(
                    "sticky flex w-full shrink-0 items-center gap-3 overflow-hidden",
                    "rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg",
                    "data-[stuck=top]:origin-top data-[stuck=bottom]:origin-bottom",
                    "data-[depth=1]:[scale:97%] data-[depth=2]:[scale:90%]",
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
                  <CloseButton
                    onClick={() => dismiss(toast.id)}
                    aria-label={t("common.a11y.dismissToast")}
                  />
                </div>
              ))}
            </div>
          )}
          <div
            ref={setPinnedToast}
            className="pointer-events-auto w-full shrink-0 empty:hidden"
          />
        </div>
      </PinnedToastContext.Provider>
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

export function ToastPinned({children}: {children: ReactNode}) {
  const pinnedToast = useContext(PinnedToastContext)

  return pinnedToast ? createPortal(children, pinnedToast) : null
}