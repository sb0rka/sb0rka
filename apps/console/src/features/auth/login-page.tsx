import { Link } from "react-router-dom"
import { SborkaLogo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <SborkaLogo />

        <Card className="w-full">
          <CardHeader>
            <CardTitle>Вход</CardTitle>
            <CardDescription>
              Введите ваши данные, чтобы войти в аккаунт.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="login">Email или Юзернейм</Label>
                <Input
                  id="login"
                  placeholder="Введите email или юзернейм"
                  autoComplete="username"
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Пароль</Label>
                  <Link
                    to="/forgot-password"
                    className="text-sm text-foreground underline"
                  >
                    Forgot your password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                />
              </div>
            </form>
          </CardContent>

          <CardFooter>
            <Button className="w-full">Login</Button>

            <p className="pt-4 text-center text-sm text-foreground">
              Нет аккаунта?{" "}
              <Link to="/register" className="underline">
                Зарегистрируйтесь
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
