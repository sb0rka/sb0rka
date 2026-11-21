import type { ReactNode } from "react"
import { Card, ScrollArea } from "@sb0rka/ui"
import { SlideIn } from "@/components/motion/page-entrance"

interface OrganizationTableProps {
  label: string
  filter: ReactNode
  headings: ReactNode
  children: ReactNode
  emptyMessage?: string
}

export function OrganizationTable({
  label,
  filter,
  headings,
  children,
  emptyMessage,
}: OrganizationTableProps) {
  return (
    <SlideIn className="flex min-h-0 flex-1 flex-col">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden pb-6">
        <div className="shrink-0 p-4 pb-3 md:p-6 md:pb-4">{filter}</div>
        <ScrollArea className="min-h-0 flex-1 md:mx-6">
          <div className="w-full min-w-0">
            <table
              aria-label={label}
              className="w-full table-fixed border-separate border-spacing-0 text-left text-xs md:text-sm"
            >
              <thead className="sticky top-0 z-10 bg-card text-muted-foreground [&_th]:h-10 [&_th]:border-b [&_th]:border-border [&_th]:px-4 [&_th]:font-medium md:[&_th]:h-12">
                <tr>{headings}</tr>
              </thead>
              <tbody className="[&_td]:px-4 [&_td]:py-3 md:[&_td]:h-14 md:[&_td]:py-4 [&_tr:not(:last-child)>td]:border-b [&_tr:not(:last-child)>td]:border-border">
                {children}
              </tbody>
            </table>
            {emptyMessage && (
              <p className="px-4 py-8 text-sm text-muted-foreground">{emptyMessage}</p>
            )}
          </div>
        </ScrollArea>
      </Card>
    </SlideIn>
  )
}
