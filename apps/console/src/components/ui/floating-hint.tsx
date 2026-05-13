import * as React from "react"
import { cn } from "@/lib/utils"

export type FloatingHintPlacement = "top" | "bottom"
export type FloatingHintAlign = "start" | "center" | "end"

/**
 * Inline hint anchored to a wrapping element. The wrapper must be `position: relative`.
 * The hint is absolutely positioned (out of flow). Any ancestor with `overflow: hidden`
 * (or `clip`) can clip it; avoid those on containers around the hint, or use a portal-based
 * tooltip if the hint must escape overflow.
 */
export interface FloatingHintProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** When null or empty, nothing is rendered. */
  message: string | null | undefined
  placement?: FloatingHintPlacement
  align?: FloatingHintAlign
}

function placementClass(placement: FloatingHintPlacement): string {
  return placement === "top" ? "bottom-full mb-1" : "top-full mt-1"
}

function alignClass(align: FloatingHintAlign): string {
  switch (align) {
    case "start":
      return "left-0"
    case "center":
      return "left-1/2 -translate-x-1/2"
    case "end":
      return "right-0"
  }
}

export function FloatingHint({
  message,
  placement = "bottom",
  align = "end",
  className,
  ...props
}: FloatingHintProps) {
  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute z-50 max-w-[min(100%,20rem)] whitespace-normal rounded-md border border-border/60 bg-background/95 px-2 py-1 text-xs text-muted-foreground opacity-90 backdrop-blur-sm",
        placementClass(placement),
        alignClass(align),
        className,
      )}
      {...props}
    >
      {message}
    </div>
  )
}
