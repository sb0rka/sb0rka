import { Children, type ReactElement } from "react"
import { Plus } from "lucide-react"
import { Button } from "@sb0rka/ui"
import { PageStagger, SlideIn, StaggerGroup } from "./motion/page-entrance"

interface ResourceListProps {
  title: string
  createLabel: string
  onCreate: () => void
  emptyTitle: string
  emptyDescription: string
  children: ReactElement[]
  /** Wider track so a UUID of the widest glyphs stays intact beside the open button. */
  wideCards?: boolean
}

export function ResourceList({
  title,
  createLabel,
  onCreate,
  emptyTitle,
  emptyDescription,
  children,
  wideCards = false,
}: ResourceListProps) {
  return (
    <PageStagger className="flex min-h-0 flex-1 flex-col gap-4">
      <SlideIn className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        <Button
          size="icon"
          className="size-9 shrink-0 rounded-xl md:h-9 md:w-auto md:rounded-md md:px-4"
          onClick={onCreate}
          aria-label={createLabel}
        >
          <Plus className="h-4 w-4 md:mr-2" aria-hidden />
          <span className="hidden md:inline">{createLabel}</span>
        </Button>
      </SlideIn>
      {children.length === 0 ? (
        <SlideIn className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-border px-4 text-center shadow-sm">
          <div className="flex flex-col items-center gap-1">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{emptyTitle}</h2>
            <p className="text-sm tracking-tight text-muted-foreground">{emptyDescription}</p>
            <Button className="mt-4" onClick={onCreate}>
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              {createLabel}
            </Button>
          </div>
        </SlideIn>
      ) : (
        <StaggerGroup
          className={
            wideCards
              ? "grid gap-3 md:gap-4 md:[grid-template-columns:repeat(auto-fill,minmax(0,480px))]"
              : "grid gap-3 md:gap-4 md:[grid-template-columns:repeat(auto-fill,minmax(0,450px))]"
          }
        >
          {Children.map(children, (card) => (
            <SlideIn className="h-full min-w-0">{card}</SlideIn>
          ))}
        </StaggerGroup>
      )}
    </PageStagger>
  )
}
