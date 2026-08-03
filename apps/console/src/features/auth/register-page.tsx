import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { SborkaLogo } from "@/components/logo"
import { Button, buttonPressClass } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LanguageSwitcher } from "@/components/language-switcher"
import { ThemeToggle } from "@/components/theme-toggle"
import { useSignup } from "./hooks"
import { ApiError } from "@/lib/api-client"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"

export function RegisterPage() {
  const { t } = useTranslation()
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [inviteToken, setInviteToken] = useState("")
  const [clientError, setClientError] = useState("")
  const signupMutation = useSignup()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setClientError("")

    if (password !== confirmPassword) {
      setClientError(t("auth.register.passwordMismatch"))
      return
    }

    signupMutation.mutate({
      username,
      email,
      password,
      invite_token: inviteToken,
    })
  }

  const error = clientError || (signupMutation.error
    ? signupMutation.error instanceof ApiError
      ? signupMutation.error.message
      : t("auth.register.fallbackError")
    : "")

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
            <CardTitle>{t("auth.register.title")}</CardTitle>
            <CardDescription>
              {t("auth.register.description")}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form id="register-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="username">{t("auth.register.usernameLabel")}</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("auth.register.usernamePlaceholder")}
                  autoComplete="username"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="email">{t("auth.register.emailLabel")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.register.emailPlaceholder")}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="password">{t("auth.register.passwordLabel")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth.register.passwordPlaceholder")}
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm-password">{t("auth.register.confirmPasswordLabel")}</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("auth.register.confirmPasswordPlaceholder")}
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-token">{t("auth.register.inviteTokenLabel")}</Label>
                <Input
                  id="invite-token"
                  value={inviteToken}
                  onChange={(e) => setInviteToken(e.target.value)}
                  placeholder={t("auth.register.inviteTokenPlaceholder")}
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </form>
          </CardContent>

          <CardFooter>
            <Button
              type="submit"
              form="register-form"
              className="w-full"
              disabled={signupMutation.isPending}
            >
              {signupMutation.isPending
                ? t("auth.register.submitting")
                : t("auth.register.submit")}
            </Button>

            <p className="text-center text-sm text-foreground">
              {t("auth.register.hasAccount")}{" "}
              <Link to="/login" className={cn("underline", buttonPressClass)}>
                {t("auth.register.loginLink")}
              </Link>
            </p>
          </CardFooter>
        </Card>
        </SlideIn>
      </PageStagger>
    </div>
  )
}
