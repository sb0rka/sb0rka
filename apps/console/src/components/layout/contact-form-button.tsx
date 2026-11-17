import { Mail } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@sb0rka/ui"

function contactFormUrl(): string | null {
  const raw = import.meta.env.VITE_CONTACT_FORM_URL?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    return url.toString()
  } catch {
    return null
  }
}

export function ContactFormButton() {
  const { t } = useTranslation()
  const href = contactFormUrl()
  if (!href) return null

  return (
    <Button
      variant="outline"
      size="icon"
      className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full"
      asChild
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("header.contactForm")}
        title={t("header.contactForm")}
      >
        <Mail className="h-4 w-4" />
      </a>
    </Button>
  )
}
