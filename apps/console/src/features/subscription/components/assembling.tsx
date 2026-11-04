import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@sb0rka/ui"

// Two blocks of the product mark slide in and click together. The loading
// state plays on the name (сборка) instead of a layout-sized placeholder.
const ASSEMBLY_CYCLE_MS = 2600
const ASSEMBLY_WIDE_DELAY_MS = 90
// Keyframes settle at 32%: the blocks have clicked together and are at rest.
const ASSEMBLY_SNAP_AT = 0.32

// Hold only through the snap. The wide block starts late, so wait until it has settled too.
export const ASSEMBLY_MIN_VISIBLE_MS = Math.round(ASSEMBLY_CYCLE_MS * ASSEMBLY_SNAP_AT) + ASSEMBLY_WIDE_DELAY_MS

const ASSEMBLY_CSS = `
@keyframes sb-asm-narrow {
  0% { transform: translate(-14px, -8px); opacity: 0; }
  22% { transform: translate(1.5px, 0.6px); opacity: 1; }
  32%, 68% { transform: translate(0, 0); opacity: 1; }
  86%, 100% { transform: translate(-14px, -8px); opacity: 0; }
}
@keyframes sb-asm-wide {
  0% { transform: translate(16px, 8px); opacity: 0; }
  22% { transform: translate(-1.5px, -0.6px); opacity: 1; }
  32%, 68% { transform: translate(0, 0); opacity: 1; }
  86%, 100% { transform: translate(16px, 8px); opacity: 0; }
}
@keyframes sb-asm-breathe {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
.sb-asm-narrow,
.sb-asm-wide {
  transform-box: fill-box;
  transform-origin: center;
}
.sb-asm-narrow {
  animation: sb-asm-narrow ${ASSEMBLY_CYCLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1) infinite both;
}
.sb-asm-wide {
  animation: sb-asm-wide ${ASSEMBLY_CYCLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1) ${ASSEMBLY_WIDE_DELAY_MS}ms infinite both;
}
@media (prefers-reduced-motion: reduce) {
  .sb-asm-narrow,
  .sb-asm-wide {
    animation: sb-asm-breathe 2.4s ease-in-out infinite;
    transform: none;
  }
}
`

function AssemblingStyle() {
  return <style>{ASSEMBLY_CSS}</style>
}

export function AssemblingLoader({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <div role="status" className={cn("flex items-center justify-center py-16", className)}>
      <AssemblingStyle />
      <svg
        viewBox="0 0 24.5 24"
        className="h-7 w-7 overflow-visible text-foreground"
        aria-hidden="true"
      >
        <rect className="sb-asm-narrow" x="0" y="6" width="7" height="13" rx="0.75" fill="currentColor" />
        <rect className="sb-asm-wide" x="8.5" y="6" width="16" height="13" rx="0.75" fill="currentColor" />
      </svg>
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  )
}

// Keeps `active` reported as true until it has been visible for at least minMs.
// Adds no delay when `active` was never true (data already in cache).
export function useMinimumVisible(active: boolean, minMs: number): boolean {
  const [shown, setShown] = useState(active)
  const shownAt = useRef<number | null>(active ? Date.now() : null)

  useEffect(() => {
    if (active) {
      shownAt.current ??= Date.now()
      setShown(true)
      return
    }
    const elapsed = shownAt.current == null ? minMs : Date.now() - shownAt.current
    const remaining = Math.max(0, minMs - elapsed)
    const hide = () => {
      shownAt.current = null
      setShown(false)
    }
    if (remaining === 0) {
      hide()
      return
    }
    const id = window.setTimeout(hide, remaining)
    return () => window.clearTimeout(id)
  }, [active, minMs])

  return shown
}
