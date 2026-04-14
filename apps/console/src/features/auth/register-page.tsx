import { Link } from "react-router-dom"
import { SborkaLogo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <SborkaLogo />

        <Card className="w-full">
          <CardHeader>
            <CardTitle>Регистрация</CardTitle>
            <CardDescription>
              Введите свои данные для создания аккаунта.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="username">Юзернейм</Label>
                <Input
                  id="username"
                  placeholder="Введите ваш юзернейм"
                  autoComplete="username"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Пароль</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Введите пароль"
                  autoComplete="new-password"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm-password">Подтверждение пароля</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Введите пароль снова"
                  autoComplete="new-password"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-code">Код приглашения</Label>
                <Input
                  id="invite-code"
                  placeholder="Введите инвайт код"
                />
              </div>
            </form>
          </CardContent>

          <CardFooter>
            <Button className="w-full">Создать аккаунт</Button>

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
