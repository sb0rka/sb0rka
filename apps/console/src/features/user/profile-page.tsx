import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ApiError } from "@/lib/api-client"
import { useUser, useUpdateProfile, useChangePassword } from "./hooks"

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export function ProfilePage() {
  const { t } = useTranslation()
  const userQuery = useUser()
  const updateProfile = useUpdateProfile()
  const changePassword = useChangePassword()

  const user = userQuery.data

  const [newEmail, setNewEmail] = useState("")
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSuccess, setEmailSuccess] = useState(false)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground">{t("profile.title")}</h1>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="gap-1.5">
            <CardTitle className="text-xl font-semibold tracking-tight">Email</CardTitle>
            <CardDescription>
              {t("profile.emailDescription")}
            </CardDescription>
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
                <p className="text-sm text-muted-foreground">{t("common.messages.changesSaved")}</p>
              ) : null}
            </CardContent>
            <CardFooter className="flex flex-row pt-6">
              <Button type="submit" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? t("common.saving") : t("common.actions.saveChanges")}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader className="gap-1.5">
            <CardTitle className="text-xl font-semibold tracking-tight">{t("profile.passwordTitle")}</CardTitle>
            <CardDescription>
              {t("profile.passwordDescription")}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handlePasswordSubmit}>
            <CardContent className="space-y-4 border-b border-border pb-6 pt-0">
              <div className="space-y-1.5">
                <Label htmlFor="profile-current-password">{t("profile.currentPassword")}</Label>
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
                <Label htmlFor="profile-confirm-password">{t("profile.confirmPassword")}</Label>
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
                <p className="text-sm text-muted-foreground">{t("profile.passwordUpdated")}</p>
              ) : null}
            </CardContent>
            <CardFooter className="flex flex-row pt-6">
              <Button type="submit" disabled={changePassword.isPending}>
                {changePassword.isPending ? t("common.saving") : t("common.actions.saveChanges")}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader className="gap-1.5 border-b border-border">
            <CardTitle className="text-xl font-semibold tracking-tight">
              {t("profile.accountTitle")}
            </CardTitle>
            <CardDescription>
              {t("profile.accountDescription")}
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-row pt-6">
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              {t("profile.deleteAccount")}
            </Button>
          </CardFooter>
        </Card>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl">{t("profile.deleteDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("profile.deleteDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setDeleteDialogOpen(false)}>
              {t("profile.understood")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
