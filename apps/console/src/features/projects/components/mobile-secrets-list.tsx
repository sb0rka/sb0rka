import { buttonPressClass } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import type { SecretRow } from "./project-detail-tab-types"

interface MobileSecretsListProps {
  rows: SecretRow[]
  emptyMessage: string
  searchQuery?: string
  onRowClick?: (row: SecretRow) => void
  showHeader?: boolean
}

const ROW_CELL_CLASS = "flex h-12 items-center border-b border-border px-4 py-3 last:border-b-0"

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function renderHighlightedText(value: string, query: string): React.ReactNode {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return value

  const regex = new RegExp(`(${escapeRegExp(normalizedQuery)})`, "gi")
  const parts = value.split(regex)

  return parts.map((part, index) => {
    if (!part) return null
    const isMatch = part.toLowerCase() === normalizedQuery.toLowerCase()

    return (
      <span
        key={`${part}-${index}`}
        className={
          isMatch
            ? "font-semibold text-[#2b9a66] underline decoration-[#2b9a66]/60"
            : ""
        }
      >
        {part}
      </span>
    )
  })
}

export function MobileSecretsList({
  rows,
  emptyMessage,
  searchQuery = "",
  onRowClick,
  showHeader = true,
}: MobileSecretsListProps) {
  const { t } = useTranslation()

  if (rows.length === 0) {
    return <div className="px-4 py-8 text-xs text-muted-foreground">{emptyMessage}</div>
  }

  return (
    <div className="flex w-full flex-col">
      {showHeader ? (
        <div className="flex h-10 items-center border-b border-border px-4 text-xs font-medium text-muted-foreground">
          {t("common.labels.name")}
        </div>
      ) : null}
      {rows.map((row) => {
        const isInteractive = Boolean(onRowClick)

        return (
          <div
            key={row.id}
            role={isInteractive ? "button" : undefined}
            tabIndex={isInteractive ? 0 : undefined}
            onClick={isInteractive ? () => onRowClick?.(row) : undefined}
            onKeyDown={
              isInteractive
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onRowClick?.(row)
                    }
                  }
                : undefined
            }
            className={cn(
              ROW_CELL_CLASS,
              isInteractive &&
                cn(
                  "cursor-pointer hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                  buttonPressClass,
                ),
            )}
          >
            <p className="truncate text-xs font-medium text-foreground">
              {renderHighlightedText(row.name, searchQuery)}
            </p>
          </div>
        )
      })}
    </div>
  )
}
