import { Navigate, Outlet } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { FREE_ACCOUNT_PLAN_CODE, useCurrentPlan } from "@/features/subscription/hooks"

export function RequireOrganizationsPlan() {
  const { t } = useTranslation()
  const planQuery = useCurrentPlan()

  if (planQuery.isLoading) {
    return (
      <div className="flex min-h-[400px] flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    )
  }

  if (planQuery.data?.code === FREE_ACCOUNT_PLAN_CODE) {
    return <Navigate to="/subscription" replace />
  }

  return <Outlet />
}
