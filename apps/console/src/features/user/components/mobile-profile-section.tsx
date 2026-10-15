import type { ReactNode } from "react"
import {
  Card,
  cn,
} from "@sb0rka/ui"

interface MobileProfileSectionProps {
  children: ReactNode
  className?: string
}

export function MobileProfileSection({
  children,
  className,
}: MobileProfileSectionProps) {
  return (
    <Card className={cn("rounded-2xl shadow-sm md:rounded-lg", className)}>
      {children}
    </Card>
  )
}
