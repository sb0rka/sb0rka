import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { ThemeProvider } from "@/components/theme-provider"
import { AppLayout } from "@/components/layout/app-layout"
import { ProjectsPage } from "@/features/projects/projects-page"
import { LoginPage } from "@/features/auth/login-page"
import { RegisterPage } from "@/features/auth/register-page"

export default function App() {
  return (
    <ThemeProvider defaultTheme="light">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<AppLayout />}>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
