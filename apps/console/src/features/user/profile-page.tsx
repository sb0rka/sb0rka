import { useEffect, useState } from "react"
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
      setEmailError("Введите новый email")
      return
    }
    if (user && trimmed === user.email) {
      setEmailError("Новый email совпадает с текущим")
      return
    }
    try {
      await updateProfile.mutateAsync({ email: trimmed })
      setEmailSuccess(true)
      setNewEmail("")
    } catch (err) {
      setEmailError(getErrorMessage(err, "Не удалось сохранить email"))
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(false)
    if (!currentPassword) {
      setPasswordError("Введите текущий пароль")
      return
    }
    if (!newPassword) {
      setPasswordError("Введите новый пароль")
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Новый пароль и подтверждение не совпадают")
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
      setPasswordError(getErrorMessage(err, "Не удалось сменить пароль"))
    }
  }

  if (userQuery.isLoading || !user) {
    return (
      <div className="flex min-h-[400px] flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </div>
    )
  }

  if (userQuery.error) {
    return (
      <div className="flex min-h-[400px] flex-1 items-center justify-center">
        <p className="text-sm text-destructive">
          {getErrorMessage(userQuery.error, "Не удалось загрузить профиль")}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground">Профиль</h1>
      </div>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="gap-1.5">
            <CardTitle className="text-xl font-semibold tracking-tight">Email</CardTitle>
            <CardDescription>
              Измените адрес электронной почты вашей учетной записи.
            </CardDescription>
            <p className="text-sm text-muted-foreground">
              Текущий email:{" "}
              <span className="font-medium text-foreground">{user.email}</span>
            </p>
          </CardHeader>
          <form onSubmit={handleEmailSubmit}>
            <CardContent className="space-y-2 border-b border-border pb-6 pt-0">
              <div className="space-y-1.5">
                <Label htmlFor="profile-new-email">Новый email</Label>
                <Input
                  id="profile-new-email"
                  type="email"
                  autoComplete="email"
                  placeholder="Введите новый email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  disabled={updateProfile.isPending}
                />
              </div>
              {emailError ? (
                <p className="text-sm text-destructive">{emailError}</p>
              ) : null}
              {emailSuccess ? (
                <p className="text-sm text-muted-foreground">Изменения сохранены.</p>
              ) : null}
            </CardContent>
            <CardFooter className="flex flex-row pt-6">
              <Button type="submit" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? "Сохранение…" : "Сохранить изменения"}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader className="gap-1.5">
            <CardTitle className="text-xl font-semibold tracking-tight">Пароль</CardTitle>
            <CardDescription>
              Измените пароль вашей учетной записи.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handlePasswordSubmit}>
            <CardContent className="space-y-4 border-b border-border pb-6 pt-0">
              <div className="space-y-1.5">
                <Label htmlFor="profile-current-password">Старый пароль</Label>
                <Input
                  id="profile-current-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Введите старый пароль"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={changePassword.isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-new-password">Новый пароль</Label>
                <Input
                  id="profile-new-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Введите новый пароль"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={changePassword.isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-confirm-password">Подтвердите новый пароль</Label>
                <Input
                  id="profile-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Введите новый пароль еще раз"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={changePassword.isPending}
                />
              </div>
              {passwordError ? (
                <p className="text-sm text-destructive">{passwordError}</p>
              ) : null}
              {passwordSuccess ? (
                <p className="text-sm text-muted-foreground">Пароль обновлён.</p>
              ) : null}
            </CardContent>
            <CardFooter className="flex flex-row pt-6">
              <Button type="submit" disabled={changePassword.isPending}>
                {changePassword.isPending ? "Сохранение…" : "Сохранить изменения"}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader className="gap-1.5 border-b border-border">
            <CardTitle className="text-xl font-semibold tracking-tight">
              Учетная запись
            </CardTitle>
            <CardDescription>
              Безвозвратно удалить вашу учетную запись и все связанные с ней данные.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-row pt-6">
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              Удалить учетную запись
            </Button>
          </CardFooter>
        </Card>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl">Удаление учётной записи</DialogTitle>
            <DialogDescription>
              В этом интерфейсе пока нет API для безвозвратного удаления аккаунта. Если вам
              нужно удалить данные, обратитесь в поддержку. Вы всегда можете выйти из аккаунта
              в шапке приложения.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setDeleteDialogOpen(false)}>
              Понятно
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
