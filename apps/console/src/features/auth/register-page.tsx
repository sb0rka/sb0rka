import { useEffect, useState, type FormEvent } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Trans, useTranslation } from "react-i18next"
import {
  Button,
  buttonPressClass,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  cn,
  Input,
  Label,
  SborkaLogo,
} from "@sb0rka/ui"
import { LanguageSwitcher } from "@/components/language-switcher"
import { ThemeToggle } from "@sb0rka/ui"
import { useSignup } from "./hooks"
import { ApiError } from "@/lib/api-client"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import { CaptchaGate } from "./captcha-gate"

const SHOW_INVITE_TOKEN = import.meta.env.VITE_SHOW_INVITE_TOKEN === "true"
const SHOW_TERMS_OF_USE_AND_PUBLIC_OFFER = import.meta.env.VITE_TERMS_OF_USE_LINK && import.meta.env.VITE_PUBLIC_OFFER_LINK

const legalLinkClass = "underline underline-offset-2 hover:text-foreground"

export function RegisterPage() {
  const { t } = useTranslation()
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [inviteCode, setInviteCode] = useState("")
  const [captchaOpen, setCaptchaOpen] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string>("")
  const sitekey = import.meta.env.VITE_CAPTCHA_SITEKEY?.trim() ?? ""
  const [clientError, setClientError] = useState("")
  const [termsOfUseAndPublicOffer, setTermsOfUseAndPublicOffer] = useState(false)
  
  const [searchParams] = useSearchParams()
  const emailParam = searchParams.get("email")?.trim() || null
  const inviteTokenParam = searchParams.get("invite_token")?.trim() || null

  useEffect(() => {
    setEmail(emailParam || "")
    setInviteCode(inviteTokenParam || "")
  }, [emailParam, inviteTokenParam])

  const signupMutation = useSignup()

  function submitRegistration(token: string) {
    const inviteToken = inviteCode.trim()
    signupMutation.mutate(
      {
        username,
        email,
        password,
        ...(inviteToken ? { invite_token: inviteToken } : {}),
        captcha_token: token,
      },
      {
        onError: () => {
          setCaptchaToken("")
        },
      },
    )
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setClientError("")
    
    if (signupMutation.isPending) return

    if (password !== confirmPassword) {
      setClientError(t("auth.register.passwordMismatch"))
      return
    }

    if (sitekey && !captchaToken) {
      setCaptchaOpen(true)
      return
    }

    submitRegistration(captchaToken)
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
                  disabled={emailParam !== null}
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

              {SHOW_INVITE_TOKEN && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="invite-code">{t("auth.register.inviteCodeLabel")}</Label>
                  <Input
                    id="invite-code"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder={t("auth.register.inviteCodePlaceholder")}
                    disabled={inviteTokenParam !== null}
                  />
                </div>
              )}

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </form>
          </CardContent>

          <CardFooter>
            {SHOW_TERMS_OF_USE_AND_PUBLIC_OFFER && (
              <div className="flex gap-2 items-center mt-0.5">
                <Checkbox
                  id="terms-of-use-and-public-offer"
                  aria-labelledby="terms-of-use-and-public-offer-label"
                  checked={termsOfUseAndPublicOffer}
                  onCheckedChange={(checked) => setTermsOfUseAndPublicOffer(Boolean(checked))}
                />
                <span
                  id="terms-of-use-and-public-offer-label"
                  className="text-xs text-muted-foreground"
                >
                  <Trans
                    i18nKey="auth.register.termsOfUseAndPublicOfferLabel"
                    components={{
                      terms: (
                        <a
                          href={import.meta.env.VITE_TERMS_OF_USE_LINK}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={legalLinkClass}
                        />
                      ),
                      offer: (
                        <a
                          href={import.meta.env.VITE_PUBLIC_OFFER_LINK}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={legalLinkClass}
                        />
                      ),
                    }}
                  />
                </span>
              </div>
             )}

            <Button
              type="submit"
              form="register-form"
              className="w-full"
              disabled={signupMutation.isPending || (SHOW_TERMS_OF_USE_AND_PUBLIC_OFFER ? !termsOfUseAndPublicOffer : false)}
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

      {sitekey ? (
        <CaptchaGate
          open={captchaOpen}
          onOpenChange={setCaptchaOpen}
          sitekey={sitekey}
          onVerified={(token) => {
            setCaptchaToken(token)
            setCaptchaOpen(false)
            submitRegistration(token)
          }}
        />
      ) : null}
    </div>
  )
}
