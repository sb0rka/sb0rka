import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@sb0rka/ui"

// Three equal beats: frames assemble, hold filled, frames leave.
const ASSEMBLY_CYCLE_MS = 2700
const ASSEMBLY_PHASE_PCT = 100 / 3
const ASSEMBLY_GLOW_PCT = (200 / ASSEMBLY_CYCLE_MS) * 100
// Keep the loader up through assemble + filled hold, not only until the snap.
export const ASSEMBLY_MIN_VISIBLE_MS = Math.round((ASSEMBLY_CYCLE_MS * 2) / 3)

// Percents are of each block's own box, so the movement scales with the mark.
const ASSEMBLY_CSS = `
@keyframes sb-asm-narrow {
  0% {
    transform: translate(-210%, -90%);
    opacity: 0;
    animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  }
  ${ASSEMBLY_PHASE_PCT}% {
    transform: translate(0, 0);
    opacity: 1;
    animation-timing-function: linear;
  }
  ${ASSEMBLY_PHASE_PCT * 2}% {
    transform: translate(0, 0);
    opacity: 1;
    animation-timing-function: cubic-bezier(0.4, 0, 1, 1);
  }
  100% {
    transform: translate(-220%, -100%);
    opacity: 0;
  }
}
@keyframes sb-asm-wide {
  0% {
    transform: translate(115%, 75%);
    opacity: 0;
    animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  }
  ${ASSEMBLY_PHASE_PCT}% {
    transform: translate(0, 0);
    opacity: 1;
    animation-timing-function: linear;
  }
  ${ASSEMBLY_PHASE_PCT * 2}% {
    transform: translate(0, 0);
    opacity: 1;
    animation-timing-function: cubic-bezier(0.4, 0, 1, 1);
  }
  100% {
    transform: translate(120%, 82%);
    opacity: 0;
  }
}
@keyframes sb-asm-fill {
  0%, ${ASSEMBLY_PHASE_PCT - 0.01}% {
    fill-opacity: 0;
    stroke-opacity: 1;
    filter: drop-shadow(0 0 0 currentColor);
  }
  ${ASSEMBLY_PHASE_PCT}% {
    fill-opacity: 1;
    stroke-opacity: 0;
    filter: drop-shadow(0 0 0.55rem currentColor);
  }
  ${ASSEMBLY_PHASE_PCT + ASSEMBLY_GLOW_PCT}%, ${ASSEMBLY_PHASE_PCT * 2}% {
    fill-opacity: 1;
    stroke-opacity: 0;
    filter: drop-shadow(0 0 0 currentColor);
  }
  ${ASSEMBLY_PHASE_PCT * 2 + 0.01}%, 100% {
    fill-opacity: 0;
    stroke-opacity: 1;
    filter: drop-shadow(0 0 0 currentColor);
  }
}
@keyframes sb-asm-breathe {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
.sb-asm-narrow,
.sb-asm-wide {
  fill: currentColor;
  stroke: currentColor;
  stroke-width: 0.7;
  paint-order: stroke fill;
  transform-box: fill-box;
  transform-origin: center;
  will-change: transform, opacity, filter, fill-opacity, stroke-opacity;
}
.sb-asm-narrow {
  animation:
    sb-asm-narrow ${ASSEMBLY_CYCLE_MS}ms linear infinite both,
    sb-asm-fill ${ASSEMBLY_CYCLE_MS}ms linear infinite both;
}
.sb-asm-wide {
  animation:
    sb-asm-wide ${ASSEMBLY_CYCLE_MS}ms linear infinite both,
    sb-asm-fill ${ASSEMBLY_CYCLE_MS}ms linear infinite both;
}
@media (prefers-reduced-motion: reduce) {
  .sb-asm-narrow,
  .sb-asm-wide {
    animation: sb-asm-breathe 2.4s ease-in-out infinite;
    transform: none;
    filter: none;
    fill-opacity: 1;
    stroke-opacity: 0;
    will-change: opacity;
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
      {/* Geometry matches SborkaLogo, not the collapsed icon mark. */}
      <svg
        viewBox="0 0 24.27995 25"
        className="aspect-[24.27995/25] h-12 overflow-visible text-foreground"
        aria-hidden="true"
      >
        <rect className="sb-asm-narrow" y="5.95972" width="7.28394" height="12.6641" rx="0.744949" fill="currentColor" />
        <rect className="sb-asm-wide" x="8.49805" y="5.95972" width="15.7819" height="12.6641" rx="0.744949" fill="currentColor" />
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
