import { useEffect, useRef, useState, type CSSProperties } from "react"
import { cn } from "@sb0rka/ui"

// Schematic parts flying in and snapping together — the loading state plays on
// the product name (сборка = assembling) instead of a generic skeleton.
// dx/dy is where a part starts from before sliding into place, in CSS pixels.
export type AssemblyPart = {
  x: number
  y: number
  w: number
  h: number
  rx: number
  dx: number
  dy: number
}

const ASSEMBLY_CSS = `
@keyframes sb-asm-part {
  0%   { transform: translate(var(--dx), var(--dy)); opacity: 0; }
  18%  { transform: translate(calc(var(--dx) * -0.08), calc(var(--dy) * -0.08)); opacity: 1; }
  26%, 72% { transform: translate(0, 0); opacity: 1; }
  86%, 100% { transform: translate(var(--dx), var(--dy)); opacity: 0; }
}
@keyframes sb-asm-frame {
  0%, 30% { stroke-opacity: 0.35; }
  40% { stroke-opacity: 0.9; }
  72%, 100% { stroke-opacity: 0.35; }
}
@keyframes sb-asm-breathe {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 0.9; }
}
.sb-asm-part {
  animation: sb-asm-part 3.2s cubic-bezier(0.22, 1, 0.36, 1) infinite both;
}
.sb-asm-frame {
  animation: sb-asm-frame 3.2s ease-in-out infinite both;
}
@media (prefers-reduced-motion: reduce) {
  .sb-asm-part { animation: sb-asm-breathe 2.4s ease-in-out infinite; transform: none; }
  .sb-asm-frame { animation: none; stroke-opacity: 0.5; }
}
`

export function AssemblingStyle() {
  return <style>{ASSEMBLY_CSS}</style>
}

export function AssemblingGraphic({
  parts,
  viewBox,
  className,
  delayMs = 0,
  stretch = false,
}: {
  parts: readonly AssemblyPart[]
  viewBox: string
  className?: string
  delayMs?: number
  stretch?: boolean
}) {
  const [, , width, height] = viewBox.split(/[\s,]+/).map(Number)
  return (
    <svg
      viewBox={viewBox}
      className={cn("text-muted-foreground", className)}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      preserveAspectRatio={stretch ? "none" : undefined}
    >
      <rect
        className="sb-asm-frame"
        x="0.5"
        y="0.5"
        width={width - 1}
        height={height - 1}
        rx="8"
        strokeWidth="1"
        strokeDasharray="4 3"
        style={{ animationDelay: `${delayMs}ms` }}
      />
      {parts.map((part, index) => (
        <rect
          key={index}
          className="sb-asm-part"
          x={part.x}
          y={part.y}
          width={part.w}
          height={part.h}
          rx={part.rx}
          strokeWidth="1.25"
          style={
            {
              "--dx": `${part.dx}px`,
              "--dy": `${part.dy}px`,
              animationDelay: `${delayMs + index * 110}ms`,
            } as CSSProperties
          }
        />
      ))}
    </svg>
  )
}

// Parts snap into place at ~830ms and hold until ~2300ms of the 3.2s loop; this
// guarantees the user sees one assembled moment instead of a flash of flying parts.
export const ASSEMBLY_MIN_VISIBLE_MS = 1400

// Keeps `active` reported as true until it has been visible for at least minMs.
// Adds no delay when `active` was never true (e.g. data served from cache).
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
