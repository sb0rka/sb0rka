import { Badge } from "@sb0rka/ui"

interface MobileUsageCardProps {
  label: string
  used?: number
  usedLabel: string
}

interface MobilePlanCardProps {
  name: string
  description?: string
  isCurrent: boolean
  currentLabel: string
  fallbackDescription: string
}

export function MobileUsageCard({
  label,
  used,
  usedLabel,
}: MobileUsageCardProps) {
  return (
    <article className="rounded-2xl border border-[var(--subscription-border)] !bg-transparent p-4">
      <p className="text-sm text-[var(--subscription-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--subscription-heading)]">
        {typeof used === "number" ? used : "—"}
      </p>
      <p className="mt-2 text-sm text-[var(--subscription-muted)]">{usedLabel}</p>
    </article>
  )
}

export function MobilePlanCard({
  name,
  description,
  isCurrent,
  currentLabel,
  fallbackDescription,
}: MobilePlanCardProps) {
  return (
    <article className="rounded-2xl border border-[var(--subscription-border)] !bg-transparent p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold tracking-tight text-[var(--subscription-heading)]">
            {name}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-[var(--subscription-muted)]">
            {description || fallbackDescription}
          </p>
        </div>
        {isCurrent ? (
          <Badge className="shrink-0 rounded-md border border-[var(--subscription-accent)] bg-[var(--subscription-accent)] px-3 py-1 font-medium text-[var(--subscription-accent-fg)] hover:bg-[var(--subscription-accent)]">
            {currentLabel}
          </Badge>
        ) : null}
      </div>
    </article>
  )
}
