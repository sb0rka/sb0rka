import * as React from "react"
import { AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export interface AlphaToastProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode
  description: React.ReactNode
  actionLabel: React.ReactNode
  onAction: () => void
}

function AlphaToast({
  title,
  description,
  actionLabel,
  onAction,
  className,
  ...props
}: AlphaToastProps) {
  const uid = React.useId()
  const titleId = `${uid}-title`
  const descriptionId = `${uid}-description`

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={cn(
        "flex gap-[6px] items-center justify-between overflow-hidden rounded-lg border border-[var(--alpha-toast-border)] bg-[var(--alpha-toast-bg)] p-4 shadow-lg",
        className
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <AlertCircle
          className="size-4 shrink-0 text-[var(--alpha-toast-foreground)]"
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] text-[var(--alpha-toast-foreground)]">
          <p id={titleId} className="font-medium leading-4">
            {title}
          </p>
          <p id={descriptionId} className="font-normal leading-5 opacity-90">
            {description}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="inline-flex h-6 shrink-0 items-center justify-center whitespace-nowrap rounded-sm bg-primary px-2 text-xs font-normal text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {actionLabel}
      </button>
    </div>
  )
}

export { AlphaToast }
