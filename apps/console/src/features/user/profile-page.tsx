import { useCallback, useEffect, useRef, useState } from "react"
import { Copy } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  Button,
  buttonPressClass,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  FloatingHint,
  Input,
  Label,
  cn,
  useToast,
} from "@sb0rka/ui"
import { ApiError } from "@/lib/api-client"
import { useUser, useUpdateProfile, useChangePassword, useDeactivateAccount } from "./hooks"
import { useConfirmDialog } from "@/components/confirm-dialog-provider"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import { MobileProfileSection } from "./components/mobile-profile-section"

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

function useCopyHint() {
  const { t } = useTranslation()
  const [message, setMessage] = useState<string | null>(null)
  const timeoutRef = useRef<number | null>(null)

  const clear = useCallback(() => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setMessage(null)
  }, [])

  useEffect(() => clear, [clear])

  const copy = useCallback(
    async (text: string | undefined) => {
      if (!text) return
      const show = (next: string, durationMs: number) => {
        if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
        setMessage(next)
        timeoutRef.current = window.setTimeout(() => {
          setMessage(null)
          timeoutRef.current = null
        }, durationMs)
      }
      try {
        await navigator.clipboard.writeText(text)
        show(t("common.messages.copied"), 2000)
      } catch {
        show(t("common.messages.copyFailed"), 3000)
      }
    },
    [t],
  )

  return { message, copy }
}

export function ProfilePage() {
  const { t } = useTranslation()
  const userQuery = useUser()
  const updateProfile = useUpdateProfile()
  const changePassword = useChangePassword()
  const deactivateAccount = useDeactivateAccount()
  const confirm = useConfirmDialog()
  const { showError } = useToast()
  const { message: copyIdMessage, copy: copyUserId } = useCopyHint()

  const user = userQuery.data

  const [newEmail, setNewEmail] = useState("")
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSuccess, setEmailSuccess] = useState(false)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  const [isDeleteInProgress, setIsDeleteInProgress] = useState(false)
  const deleteInProgressRef = useRef(false)

  useEffect(() => {
    setEmailSuccess(false)
    setEmailError(null)
  }, [newEmail])

  useEffect(() => {
    setPasswordSuccess(false)
    setPasswordError(null)
  }, [currentPassword, newPassword, confirmPassword])

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEmailError(null)
    setEmailSuccess(false)
    const trimmed = newEmail.trim()
    if (!trimmed) {
      setEmailError(t("profile.emailRequired"))
      return
    }
    if (user && trimmed === user.email) {
      setEmailError(t("profile.emailSame"))
      return
    }
    try {
      await updateProfile.mutateAsync({ email: trimmed })
      setEmailSuccess(true)
      setNewEmail("")
    } catch (err) {
      setEmailError(getErrorMessage(err, t("profile.emailSaveError")))
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(false)
    if (!currentPassword) {
      setPasswordError(t("profile.currentPasswordRequired"))
      return
    }
    if (!newPassword) {
      setPasswordError(t("profile.newPasswordRequired"))
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t("profile.passwordMismatch"))
      return
    }
    try {
      await changePassword.mutateAsync({
        current_password: currentPassword,
        new_password: newPassword,
      })
      setPasswordSuccess(true)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err) {
      setPasswordError(getErrorMessage(err, t("profile.passwordSaveError")))
    }
  }

  async function handleDeleteAccount() {
    if (!user || deleteInProgressRef.current) return

    deleteInProgressRef.current = true
    setIsDeleteInProgress(true)
    try {
      const confirmed = await confirm({
        title: t("profile.deleteDialogTitle"),
        description: t("profile.deleteDialogDescription"),
        infoNode: (
          <div className="flex flex-col items-center gap-3 px-6">
            <p className="text-lg font-medium">{user.username}</p>
            <p className="text-sm text-muted-foreground">
              {t("profile.typeUsernameToConfirm")}
            </p>
          </div>
        ),
        strongConfirmValue: user.username,
        confirmText: t("common.actions.delete"),
        cancelText: t("common.actions.cancel"),
        confirmVariant: "destructive",
      })
      if (!confirmed) return

      await deactivateAccount.mutateAsync()
    } catch (error) {
      showError(getErrorMessage(error, t("profile.deleteError")))
    } finally {
      deleteInProgressRef.current = false
      setIsDeleteInProgress(false)
    }
  }

  if (userQuery.isLoading || !user) {
    return (
      <div className="flex min-h-[400px] flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    )
  }

  if (userQuery.error) {
    return (
      <div className="flex min-h-[400px] flex-1 items-center justify-center">
        <p className="text-sm text-destructive">
          {getErrorMessage(userQuery.error, t("profile.loadError"))}
        </p>
      </div>
    )
  }

  return (
    <PageStagger className="flex flex-col gap-4">
      <SlideIn className="flex flex-col gap-2">
        <div className="flex min-w-0 items-center justify-between gap-6">
          <h1
            className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-foreground md:text-2xl"
            title={t("profile.heading", { username: user.username })}
          >
            {t("profile.heading", { username: user.username })}
          </h1>
          <div className="relative mr-1 flex min-w-0 shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void copyUserId(user.id)}
              className={cn(
                "inline-flex shrink-0 items-center justify-center text-muted-foreground",
                buttonPressClass,
              )}
              aria-label={t("profile.copyUserId")}
            >
              <Copy className="size-4 shrink-0" />
            </button>
            <span
              className="max-w-[14rem] truncate text-left text-sm leading-5 text-muted-foreground sm:max-w-[22rem]"
              title={user.id}
            >
              {user.id}
            </span>
            <FloatingHint message={copyIdMessage} placement="bottom" align="end" />
          </div>
        </div>
      </SlideIn>

      <div className="flex flex-col gap-6">
        <SlideIn>
          <MobileProfileSection>
            <CardHeader className="gap-1.5">
              <CardTitle className="text-xl font-semibold tracking-tight">Email</CardTitle>
              <CardDescription>{t("profile.emailDescription")}</CardDescription>
              <p className="text-sm text-muted-foreground">
                {t("profile.currentEmail")}{" "}
                <span className="font-medium text-foreground">{user.email}</span>
              </p>
            </CardHeader>
            <form onSubmit={handleEmailSubmit}>
              <CardContent className="space-y-2 border-b border-border pb-6 pt-0">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-new-email">{t("profile.newEmail")}</Label>
                  <Input
                    id="profile-new-email"
                    type="email"
                    autoComplete="email"
                    placeholder={t("profile.newEmailPlaceholder")}
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    disabled={updateProfile.isPending}
                  />
                </div>
                {emailError ? (
                  <p className="text-sm text-destructive">{emailError}</p>
                ) : null}
                {emailSuccess ? (
                  <p className="text-sm text-muted-foreground">
                    {t("common.messages.changesSaved")}
                  </p>
                ) : null}
              </CardContent>
              <CardFooter className="flex flex-row pt-6 [&>button]:w-full md:[&>button]:w-auto">
                <Button type="submit" disabled={updateProfile.isPending}>
                  {updateProfile.isPending
                    ? t("common.saving")
                    : t("common.actions.saveChanges")}
                </Button>
              </CardFooter>
            </form>
          </MobileProfileSection>
        </SlideIn>

        <SlideIn>
          <MobileProfileSection>
            <CardHeader className="gap-1.5">
              <CardTitle className="text-xl font-semibold tracking-tight">
                {t("profile.passwordTitle")}
              </CardTitle>
              <CardDescription>{t("profile.passwordDescription")}</CardDescription>
            </CardHeader>
            <form onSubmit={handlePasswordSubmit}>
              <CardContent className="space-y-4 border-b border-border pb-6 pt-0">
                <div className="space-y-1.5">
                  <Label htmlFor="profile-current-password">
                    {t("profile.currentPassword")}
                  </Label>
                  <Input
                    id="profile-current-password"
                    type="password"
                    autoComplete="current-password"
                    placeholder={t("profile.currentPasswordPlaceholder")}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={changePassword.isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-new-password">{t("profile.newPassword")}</Label>
                  <Input
                    id="profile-new-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder={t("profile.newPasswordPlaceholder")}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={changePassword.isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="profile-confirm-password">
                    {t("profile.confirmPassword")}
                  </Label>
                  <Input
                    id="profile-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder={t("profile.confirmPasswordPlaceholder")}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={changePassword.isPending}
                  />
                </div>
                {passwordError ? (
                  <p className="text-sm text-destructive">{passwordError}</p>
                ) : null}
                {passwordSuccess ? (
                  <p className="text-sm text-muted-foreground">
                    {t("profile.passwordUpdated")}
                  </p>
                ) : null}
              </CardContent>
              <CardFooter className="flex flex-row pt-6 [&>button]:w-full md:[&>button]:w-auto">
                <Button type="submit" disabled={changePassword.isPending}>
                  {changePassword.isPending
                    ? t("common.saving")
                    : t("common.actions.saveChanges")}
                </Button>
              </CardFooter>
            </form>
          </MobileProfileSection>
        </SlideIn>

        <SlideIn>
          <MobileProfileSection>
            <CardHeader className="gap-1.5 border-b border-border">
              <CardTitle className="text-xl font-semibold tracking-tight">
                {t("profile.accountTitle")}
              </CardTitle>
              <CardDescription>{t("profile.accountDescription")}</CardDescription>
            </CardHeader>
            <CardFooter className="flex flex-row pt-6 [&>button]:w-full md:[&>button]:w-auto">
              <Button
                type="button"
                variant="delete"
                onClick={() => void handleDeleteAccount()}
                disabled={isDeleteInProgress}
              >
                {deactivateAccount.isPending ? t("common.deleting") : t("profile.deleteAccount")}
              </Button>
            </CardFooter>
          </MobileProfileSection>
        </SlideIn>
      </div>
    </PageStagger>
  )
}
