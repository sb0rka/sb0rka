import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const segmentVariants = cva("h-full min-w-0 transition-[width] duration-500 motion-reduce:transition-none", {
  variants: {
    tone: {
      neutral: "bg-[var(--subscription-accent)]",
      warning: "bg-amber-500",
      danger: "bg-destructive",
      held: "bg-[var(--subscription-accent-bright)]",
      available: "bg-[var(--subscription-muted)]",
      used: "bg-[var(--subscription-accent)]",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
})

export type ProgressTone = NonNullable<VariantProps<typeof segmentVariants>["tone"]>

export interface ProgressSegment {
  value: number
  tone: ProgressTone
}

interface ProgressProps {
  segments: ProgressSegment[]
  max: number
  /** meter: each segment is value/max and the rest of the track stays empty. stack: segments share the full width. */
  mode?: "meter" | "stack"
  label?: string
  className?: string
}

function segmentWidths(segments: ProgressSegment[], max: number, mode: "meter" | "stack"): number[] {
  const values = segments.map((segment) => Math.max(segment.value, 0))
  if (mode === "stack") {
    const sum = values.reduce((total, value) => total + value, 0)
    const cap = sum > 0 ? sum : max
    if (cap <= 0) return values.map(() => 0)
    return values.map((value) => (value / cap) * 100)
  }
  if (max <= 0) return values.map(() => 0)
  return values.map((value) => Math.min(100, (value / max) * 100))
}

export function Progress({
  segments,
  max,
  mode = "meter",
  label,
  className,
}: ProgressProps) {
  const widths = segmentWidths(segments, max, mode)
  const consumed = segments.reduce((total, segment) => {
    if (segment.tone === "available") return total
    return total + Math.max(segment.value, 0)
  }, 0)
  const cap = mode === "stack"
    ? Math.max(consumed, max)
    : Math.max(max, 0)

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={cap}
      aria-valuenow={Math.min(consumed, cap)}
      className={cn("flex h-2 w-full overflow-hidden rounded-full bg-[var(--subscription-progress-track)]", className)}
    >
      {segments.map((segment, index) => (
        <div
          key={`${segment.tone}-${index}`}
          className={segmentVariants({ tone: segment.tone })}
          style={{ width: `${widths[index] ?? 0}%` }}
        />
      ))}
    </div>
  )
}
