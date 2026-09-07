import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { SborkaLogo } from "@/components/logo"
import { Button, buttonPressClass } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LanguageSwitcher } from "@/components/language-switcher"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"
import { useLogin } from "./hooks"
import { continueOidcLogin, getOidcAuthRequestId } from "./api"
import { useAuth } from "./auth-provider"
import { ApiError } from "@/lib/api-client"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"

export function LoginPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const { isAuthenticated, isLoading } = useAuth()
  const authRequestId = getOidcAuthRequestId(searchParams.get("return_to"))
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [continuationError, setContinuationError] = useState<unknown>(null)
  const [isContinuing, setIsContinuing] = useState(false)
  const automaticContinuationStarted = useRef(false)
  const continuationInFlight = useRef(false)

  const continueOidcAuthorization = useCallback(async () => {
    if (!authRequestId || continuationInFlight.current) return

    continuationInFlight.current = true
    setContinuationError(null)
    setIsContinuing(true)
    try {
      const redirectTo = await continueOidcLogin(authRequestId)
      window.location.replace(redirectTo)
    } catch (error) {
      continuationInFlight.current = false
      setContinuationError(error)
      setIsContinuing(false)
    }
  }, [authRequestId])

  const loginMutation = useLogin(authRequestId ? continueOidcAuthorization : undefined)

  useEffect(() => {
    if (
      !authRequestId ||
      isLoading ||
      !isAuthenticated ||
      automaticContinuationStarted.current
    ) {
      return
    }

    automaticContinuationStarted.current = true
    void continueOidcAuthorization()
  }, [authRequestId, continueOidcAuthorization, isAuthenticated, isLoading])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    loginMutation.mutate({ login, password })
  }

  if (authRequestId && (isLoading || isAuthenticated)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>
              {continuationError
                ? t("auth.login.continueError")
                : t("auth.login.continuing")}
            </CardTitle>
            <CardDescription>
              {continuationError
                ? continuationError instanceof ApiError
                  ? continuationError.message
                  : t("auth.login.fallbackError")
                : t("auth.login.continuingDescription")}
            </CardDescription>
          </CardHeader>
          {Boolean(continuationError) && (
            <CardFooter>
              <Button
                type="button"
                className="w-full"
                disabled={isContinuing}
                onClick={() => void continueOidcAuthorization()}
              >
                {isContinuing
                  ? t("auth.login.continuing")
                  : t("auth.login.continueRetry")}
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>
      <PageStagger className="flex w-full max-w-sm flex-col items-center gap-6">
        <SlideIn>
          <a href={import.meta.env.VITE_LANDING_URL || "/"}>
            <SborkaLogo />
          </a>
        </SlideIn>

        <SlideIn className="w-full">
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

              {Boolean(loginMutation.error || continuationError) && (
                <p className="text-sm text-destructive">
                  {loginMutation.error instanceof ApiError
                    ? loginMutation.error.message
                    : continuationError instanceof ApiError
                      ? continuationError.message
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
              <Link to="/register" className={cn("underline", buttonPressClass)}>
                {t("auth.login.registerLink")}
              </Link>
            </p>
          </CardFooter>
        </Card>
        </SlideIn>
      </PageStagger>
    </div>
  )
}
