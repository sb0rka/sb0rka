import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ApiError } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { useCurrentPlan, usePlans, useSubscriptionUsage } from "./hooks"
import type { SubscriptionUsage } from "./hooks"
import type { PlanResponse } from "./api"

interface LimitItem {
  key: keyof Pick<
    PlanResponse,
    | "project_limit"
    | "db_limit"
    | "secret_limit"
    | "function_limit"
    | "code_limit"
    | "group_limit"
  >
  label: string
  usageKey?: keyof SubscriptionUsage
}

const LIMIT_ITEMS: LimitItem[] = [
  { key: "project_limit", label: "Проекты", usageKey: "projects" },
  { key: "db_limit", label: "Базы\u00a0данных", usageKey: "databases" },
  { key: "secret_limit", label: "Секреты", usageKey: "secrets" },
  { key: "function_limit", label: "Функции" },
  { key: "code_limit", label: "Кодовые единицы" },
  { key: "group_limit", label: "Группы" },
]

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

function getUsageProgress(used: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min((used / limit) * 100, 100)
}

const PLAN_PREVIEW_LIMITS: Array<{
  key: keyof Pick<PlanResponse, "project_limit" | "db_limit" | "secret_limit">
  label: string
}> = [
  { key: "project_limit", label: "Проекты" },
  { key: "db_limit", label: "Базы\u00a0данных" },
  { key: "secret_limit", label: "Секреты" },
]

export function SubscriptionPage() {
  const currentPlanQuery = useCurrentPlan()
  const plansQuery = usePlans()
  const usageQuery = useSubscriptionUsage()

  const currentPlan = currentPlanQuery.data
  const plans = plansQuery.data?.plans ?? []
  const usage = usageQuery.data
  const isLoading = currentPlanQuery.isLoading || plansQuery.isLoading || usageQuery.isLoading
  const error = currentPlanQuery.error ?? plansQuery.error

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[500px]">
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </div>
    )
  }

  if (error || !currentPlan) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[500px]">
        <p className="text-sm text-destructive">
          {getErrorMessage(error, "Не удалось загрузить данные подписки")}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-foreground">Подписка</h1>
          <p className="text-sm text-muted-foreground">
            Текущий план и лимиты ресурсов вашего аккаунта.
          </p>
        </div>
        <Badge variant="active">Текущий план</Badge>
      </div>

      <Card>
        <CardHeader className="gap-2">
          <CardTitle>{currentPlan.name}</CardTitle>
          <CardDescription>
            {currentPlan.description || "Описание тарифа не указано"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-start gap-4">
          {LIMIT_ITEMS.map((item) => {
            const limit = currentPlan[item.key]
            const used = item.usageKey ? usage?.[item.usageKey] : undefined
            const progress = item.usageKey
              ? getUsageProgress(typeof used === "number" ? used : 0, limit)
              : 0

            return (
              <div
                key={item.key}
                className="min-w-[240px] max-w-sm shrink-0 rounded-lg border border-border p-4"
              >
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-2xl font-bold tracking-tight">{limit}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Использовано:{" "}
                  {typeof used === "number" ? `${used} / ${limit}` : "—"}
                </p>
                {/* {item.usageKey ? ( */}
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[#5c7c2f] transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                {/* ) : null} */}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Доступные планы</CardTitle>
          <CardDescription>
            Сравните условия и выберите подходящий тариф.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-start gap-4">
          {plans.length === 0 ? (
            <p className="w-full text-sm text-muted-foreground">Список тарифов пуст</p>
          ) : (
            plans.map((plan) => {
              const isCurrent = plan.id === currentPlan.id
              return (
                <div
                  key={plan.id}
                  className={cn(
                    "flex min-w-[240px] max-w-sm shrink-0 flex-col rounded-lg border border-border p-5",
                    isCurrent && "border-[#5c7c2f] ring-1 ring-[#5c7c2f]/25",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold tracking-tight">
                        {plan.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {plan.description || "Описание тарифа не указано"}
                      </p>
                    </div>
                    {isCurrent ? <Badge variant="active-solid">Текущий</Badge> : null}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {PLAN_PREVIEW_LIMITS.map((item) => (
                      <div
                        key={item.key}
                        className="min-w-[5.5rem] grow basis-0 rounded-md border border-border px-2.5 py-2"
                      >
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className="mt-1 text-base font-semibold leading-none">
                          {plan[item.key]}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
