import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

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
