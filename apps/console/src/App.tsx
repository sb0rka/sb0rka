import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "@/lib/query-client"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider, RequireAuth } from "@/features/auth/auth-provider"
import { AppLayout } from "@/components/layout/app-layout"
import { ProjectsPage } from "@/features/projects/projects-page"
import { ProjectDetailPage } from "@/features/projects/project-detail-page"
import { DatabaseDetailPage } from "@/features/projects/database-detail-page"
import { SubscriptionPage } from "@/features/subscription/subscription-page"
import { ProfilePage } from "@/features/user/profile-page"
import { LoginPage } from "@/features/auth/login-page"
import { RegisterPage } from "@/features/auth/register-page"

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider defaultTheme="light">
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route element={<RequireAuth />}>
                <Route element={<AppLayout />}>
                  <Route path="/projects" element={<ProjectsPage />} />
                  <Route path="/subscription" element={<SubscriptionPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/projects/:id" element={<ProjectDetailPage />} />
                  <Route
                    path="/projects/:id/databases/:resourceId"
                    element={<DatabaseDetailPage />}
                  />
                  <Route path="*" element={<Navigate to="/projects" replace />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
