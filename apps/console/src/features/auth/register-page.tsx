import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { SborkaLogo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSignup } from "./hooks"
import { ApiError } from "@/lib/api-client"

export function RegisterPage() {
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [inviteCode, setInviteCode] = useState("")
  const [clientError, setClientError] = useState("")
  const signupMutation = useSignup()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setClientError("")

    if (password !== confirmPassword) {
      setClientError("Пароли не совпадают.")
      return
    }

    signupMutation.mutate({
      username,
      email,
      password,
      invite_code: inviteCode,
    })
  }

  const error = clientError || (signupMutation.error
    ? signupMutation.error instanceof ApiError
      ? signupMutation.error.message
      : "Не удалось создать аккаунт. Попробуйте снова."
    : "")

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <a href={import.meta.env.VITE_LANDING_URL || "/"}>
          <SborkaLogo />
        </a>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>Регистрация</CardTitle>
            <CardDescription>
              Введите свои данные для создания аккаунта.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form id="register-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="username">Имя пользователя</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Введите ваш username"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Введите ваш email"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Пароль</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm-password">Подтверждение пароля</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Введите пароль снова"
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-code">Код приглашения</Label>
                <Input
                  id="invite-code"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Введите код приглашения"
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
              {signupMutation.isPending ? "Создание…" : "Создать аккаунт"}
            </Button>

            <p className="text-center text-sm text-foreground">
              Уже есть аккаунт?{" "}
              <Link to="/login" className="underline">
                Войдите
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
