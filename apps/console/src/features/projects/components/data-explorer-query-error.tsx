import { useId } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type DataExplorerQueryErrorProps = {
  title: string
  message: string
  fixLabel: string
  fixPendingLabel: string
  onFix: () => void
  fixDisabled: boolean
  fixPending: boolean
  className?: string
}

export function DataExplorerQueryError({
  title,
  message,
  fixLabel,
  fixPendingLabel,
  onFix,
  fixDisabled,
  fixPending,
  className,
}: DataExplorerQueryErrorProps) {
  const titleId = useId()

  return (
    <div
      role="alert"
      aria-labelledby={titleId}
      className={cn(
        "flex flex-col items-start gap-4 rounded-lg border border-destructive/25 bg-destructive/5 p-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <AlertCircle
          className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p id={titleId} className="text-sm font-medium leading-snug text-foreground">
            {title}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
            {message}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        className="shrink-0 min-w-[150px] self-end"
        disabled={fixDisabled || fixPending}
        onClick={onFix}
      >
        {fixPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            {fixPendingLabel}
          </>
        ) : (
          fixLabel
        )}
      </Button>
    </div>
  )
}
