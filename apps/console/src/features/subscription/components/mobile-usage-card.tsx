import { Badge } from "@/components/ui/badge"
import { UsageProgressBar } from "@/components/motion/page-entrance"
import type { PlanResponse } from "@/features/subscription/api"

interface MobileUsageCardProps {
  label: string
  limit: number
  used?: number
  progress: number
  delay: number
  usedLabel: string
}

interface MobilePlanCardProps {
  plan: PlanResponse
  isCurrent: boolean
  currentLabel: string
  fallbackDescription: string
  limits: Array<{
    key: "project_limit" | "db_limit" | "secret_limit"
    label: string
  }>
}

export function MobileUsageCard({
  label,
  limit,
  used,
  progress,
  delay,
  usedLabel,
}: MobileUsageCardProps) {
  return (
    <article className="rounded-2xl border border-[var(--subscription-border)] !bg-transparent p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--subscription-muted)]">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--subscription-heading)]">
            {limit}
          </p>
        </div>
        <p className="rounded-full bg-muted/50 px-2.5 py-1 text-xs font-medium text-[var(--subscription-muted)]">
          {typeof used === "number" ? `${used} / ${limit}` : "—"}
        </p>
      </div>
      <p className="mt-2 text-sm text-[var(--subscription-muted)]">{usedLabel}</p>
      <UsageProgressBar
        className="mt-3 !bg-[var(--subscription-progress-track)]"
        barClassName="!bg-[var(--subscription-accent-bright)]"
        progress={progress}
        delay={delay}
      />
    </article>
  )
}

export function MobilePlanCard({
  plan,
  isCurrent,
  currentLabel,
  fallbackDescription,
  limits,
}: MobilePlanCardProps) {
  return (
    <article className="rounded-2xl border border-[var(--subscription-border)] !bg-transparent p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold tracking-tight text-[var(--subscription-heading)]">
            {plan.name}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-[var(--subscription-muted)]">
            {plan.description || fallbackDescription}
          </p>
        </div>
        {isCurrent ? (
          <Badge className="shrink-0 rounded-md border border-[var(--subscription-accent)] bg-[var(--subscription-accent)] px-3 py-1 font-medium text-[var(--subscription-accent-fg)] hover:bg-[var(--subscription-accent)]">
            {currentLabel}
          </Badge>
        ) : null}
      </div>

      <ul className="mt-4 divide-y divide-[var(--subscription-border)] rounded-xl bg-muted/20">
        {limits.map((limit) => (
          <li
            key={limit.key}
            className="flex items-baseline justify-between gap-4 px-3 py-2.5 text-sm"
          >
            <span className="text-[var(--subscription-muted)]">{limit.label}</span>
            <span className="font-semibold tabular-nums text-[var(--subscription-heading)]">
              {plan[limit.key]}
            </span>
          </li>
        ))}
      </ul>
    </article>
  )
}
