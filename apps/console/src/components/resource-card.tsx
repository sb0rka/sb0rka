import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { Copy } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  Button,
  buttonPressClass,
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
  FloatingHint,
} from "@sb0rka/ui"

interface ResourceCardProps {
  name: string
  id: string
  href: string
  openLabel: string
  copyLabel: string
  mark?: ReactNode
  badge?: ReactNode
  children: ReactNode
}

export function ResourceCard({
  name,
  id,
  href,
  openLabel,
  copyLabel,
  mark,
  badge,
  children,
}: ResourceCardProps) {
  const { t } = useTranslation()
  const [hint, setHint] = useState<{ message: string; delay: number } | null>(null)

  useEffect(() => {
    if (!hint) return
    const timer = window.setTimeout(() => setHint(null), hint.delay)
    return () => window.clearTimeout(timer)
  }, [hint])

  async function copyId() {
    try {
      await navigator.clipboard.writeText(id)
      setHint({ message: t("common.messages.idCopied"), delay: 2000 })
    } catch {
      setHint({ message: t("common.messages.copyFailed"), delay: 3000 })
    }
  }

  return (
    <Card className="flex h-full flex-col rounded-2xl shadow-sm md:rounded-lg">
      <CardHeader className="flex-1 gap-2 px-4 pb-2 pt-4 md:gap-3 md:px-6 md:pb-4 md:pt-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 md:gap-2">
            {mark ? (
              <span className="inline-flex shrink-0 -translate-y-px items-center justify-center text-muted-foreground md:translate-y-px">
                {mark}
              </span>
            ) : null}
            <CardTitle className="min-w-0 truncate text-lg font-semibold leading-normal tracking-[-0.2px] md:text-xl md:tracking-[-0.3px]">
              {name}
            </CardTitle>
          </div>
          {badge}
        </div>
        {children}
      </CardHeader>
      <CardFooter className="mt-auto flex items-stretch gap-4 px-4 pb-4 md:flex-row md:flex-nowrap md:items-center md:gap-6 md:px-6 md:pb-6">
        <div className="relative flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground md:flex-1 md:gap-2 md:text-sm">
          <button
            type="button"
            onClick={() => void copyId()}
            aria-label={copyLabel}
            className={cn(
              "inline-flex shrink-0 items-center justify-center",
              buttonPressClass,
            )}
          >
            <Copy className="size-3.5 md:size-4" aria-hidden />
          </button>
          <span className="truncate" title={id}>
            {id}
          </span>
          <FloatingHint message={hint?.message ?? null} placement="bottom" align="start" />
        </div>
        <Button
          asChild
          className="h-11 w-full rounded-xl md:h-9 md:w-auto md:shrink-0 md:rounded-md"
        >
          <Link to={href}>{openLabel}</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
