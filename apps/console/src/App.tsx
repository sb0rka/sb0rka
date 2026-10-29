import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClientProvider } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { queryClient } from "@/lib/query-client"
import {
  A11yLabelsProvider,
  ThemeProvider,
  ToastProvider,
  TooltipProvider,
} from "@sb0rka/ui"
import { ConfirmDialogProvider } from "@/components/confirm-dialog-provider"
import { AuthProvider, RequireAuth } from "@/features/auth/auth-provider"
import { AppLayout } from "@/components/layout/app-layout"
import { ProjectsPage } from "@/features/projects/projects-page"
import { ProjectDetailPage } from "@/features/projects/project-detail-page"
import { DatabaseDetailPage } from "@/features/projects/database-detail-page"
import { DatabaseQueryPage } from "@/features/projects/database-query-page"
import { MetricDetailPage } from "@/features/projects/metric-detail-page"
import { SubscriptionPage } from "@/features/subscription/subscription-page"
import { ProfilePage } from "@/features/user/profile-page"
import { OrganizationsPage } from "@/features/organizations/organizations-page"
import { OrganizationDetailPage } from "@/features/organizations/organization-detail-page"
import { RequireOrganizationsPlan } from "@/features/organizations/require-organizations-plan"
import { LoginPage } from "@/features/auth/login-page"
import { RegisterPage } from "@/features/auth/register-page"
import { MobileDataExplorerPage } from "./features/projects/mobile-data-explorer-page"
import "@/lib/i18n"

export default function App() {
  const { t } = useTranslation()

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider defaultTheme="system">
          <A11yLabelsProvider
            labels={{
              close: t("common.a11y.close"),
              dismissToast: t("common.a11y.dismissToast"),
              toggleTheme: t("header.toggleTheme"),
            }}
          >
            <TooltipProvider delayDuration={300}>
              <ToastProvider>
                <ConfirmDialogProvider>
                  <BrowserRouter>
                    <Routes>
                      <Route path="/login" element={<LoginPage />} />
                      <Route path="/register" element={<RegisterPage />} />
                      <Route element={<RequireAuth />}>
                        <Route
                          path="/projects/:id/mobile-data-explorer"
                          element={<MobileDataExplorerPage />}
                        />
                        <Route element={<AppLayout />}>
                          <Route path="/projects" element={<ProjectsPage />} />
                          <Route element={<RequireOrganizationsPlan />}>
                            <Route path="/organizations" element={<OrganizationsPage />} />
                            <Route path="/organizations/:orgId" element={<OrganizationDetailPage />} />
                          </Route>
                          <Route path="/subscription" element={<SubscriptionPage />} />
                          <Route path="/profile" element={<ProfilePage />} />
                          <Route path="/projects/:id" element={<ProjectDetailPage />} />
                          <Route
                            path="/projects/:id/databases/:resourceId/query"
                            element={<DatabaseQueryPage />}
                          />
                          <Route
                            path="/projects/:id/databases/:resourceId"
                            element={<DatabaseDetailPage />}
                          />
                          <Route path="/projects/:id/metrics/:metric" element={<MetricDetailPage />} />
                          <Route path="*" element={<Navigate to="/projects" replace />} />
                        </Route>
                      </Route>
                    </Routes>
                  </BrowserRouter>
                </ConfirmDialogProvider>
              </ToastProvider>
            </TooltipProvider>
          </A11yLabelsProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
