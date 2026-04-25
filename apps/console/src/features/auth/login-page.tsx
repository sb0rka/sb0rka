import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { SborkaLogo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useLogin } from "./hooks"
import { ApiError } from "@/lib/api-client"

export function LoginPage() {
  const { t } = useTranslation()
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const loginMutation = useLogin()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    loginMutation.mutate({ login, password })
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <a href={import.meta.env.VITE_LANDING_URL || "/"}>
          <SborkaLogo />
        </a>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>{t("auth.login.title")}</CardTitle>
            <CardDescription>
              {t("auth.login.description")}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form id="login-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="login">{t("auth.login.loginLabel")}</Label>
                <Input
                  id="login"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder={t("auth.login.loginPlaceholder")}
                  autoComplete="username"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t("auth.login.passwordLabel")}</Label>
                  {/* <Link
                    to="/forgot-password"
                    className="text-sm text-foreground underline"
                  >
                    Forgot your password?
                  </Link> */}
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth.login.passwordPlaceholder")}
                  autoComplete="current-password"
                  required
                />
              </div>

              {loginMutation.error && (
                <p className="text-sm text-destructive">
                  {loginMutation.error instanceof ApiError
                    ? loginMutation.error.message
                    : t("auth.login.fallbackError")}
                </p>
              )}
            </form>
          </CardContent>

          <CardFooter>
            <Button
              type="submit"
              form="login-form"
              className="w-full"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? t("auth.login.submitting") : t("auth.login.submit")}
            </Button>

            <p className="pt-4 text-center text-sm text-foreground">
              {t("auth.login.noAccount")}{" "}
              <Link to="/register" className="underline">
                {t("auth.login.registerLink")}
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
