import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowDown, ArrowUp, Check, ChevronDown, Copy } from "lucide-react"
import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useToast,
} from "@sb0rka/ui"
import type { LLMModel } from "../api"
import {
  MODEL_CAPABILITIES,
  modelCapabilities,
  type ModelCapability,
  type ModelSort,
  type ModelSortColumn,
} from "../models-utils"
import { CAPABILITY_ICONS } from "./models-table-capabilities"

export interface ModelsTableSelection {
  selectedIds: ReadonlySet<string>
  onChange: (next: Set<string>) => void
}

export function SortHeader({
  label,
  column,
  sort,
  align = "start",
  onSort,
}: {
  label: string
  column: ModelSortColumn
  sort: ModelSort
  align?: "start" | "end"
  onSort: (column: ModelSortColumn) => void
}) {
  const active = sort.column === column
  return (
    <div
      role="columnheader"
      tabIndex={0}
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      onClick={() => onSort(column)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onSort(column)
        }
      }}
      className={cn(
        "flex h-12 min-w-0 cursor-pointer items-center gap-1 px-4 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
        align === "end" && "justify-end text-right",
        active && "text-foreground",
      )}
    >
      <span className="truncate">{label}</span>
      {active ? (
        sort.direction === "asc" ? (
          <ArrowUp className="size-3.5 shrink-0" aria-hidden />
        ) : (
          <ArrowDown className="size-3.5 shrink-0" aria-hidden />
        )
      ) : null}
    </div>
  )
}

export function CapabilityIcons({
  model,
  labels,
  layout = "inline",
}: {
  model: LLMModel
  labels: Record<ModelCapability, string>
  layout?: "inline" | "grid"
}) {
  const { t } = useTranslation()
  const capabilities = modelCapabilities(model)

  if (layout === "grid") {
    const present = new Set(capabilities)
    return (
      <div
        className="grid w-[5.5rem] grid-cols-4 items-center gap-1"
        aria-label={capabilities.length === 0 ? t("common.notAvailable") : undefined}
      >
        {MODEL_CAPABILITIES.map((capability) => {
          const Icon = CAPABILITY_ICONS[capability]
          if (!present.has(capability)) {
            return (
              <span
                key={capability}
                className="flex size-5 items-center justify-center text-muted-foreground opacity-30"
                aria-hidden
              >
                <Icon className="size-4" aria-hidden />
              </span>
            )
          }
          const label = labels[capability]
          return (
            <Tooltip key={capability}>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  aria-label={label}
                  className="flex size-5 items-center justify-center rounded-sm text-foreground outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <Icon className="size-4" aria-hidden />
                </span>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    )
  }

  if (capabilities.length === 0) {
    return <span className="text-sm text-muted-foreground">{t("common.notAvailable")}</span>
  }
  return (
    <div className="flex items-center gap-1.5">
      {capabilities.map((capability) => {
        const Icon = CAPABILITY_ICONS[capability]
        const label = labels[capability]
        return (
          <Tooltip key={capability}>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                aria-label={label}
                className="inline-flex rounded-sm text-muted-foreground/80 outline-none transition-colors group-hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Icon className="size-4" aria-hidden />
              </span>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

function CopySlugButton({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const { showSuccess, showError } = useToast()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setCopied(false)
  }, [slug])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(slug)
      setCopied(true)
      showSuccess(t("common.messages.copied"))
    } catch {
      showError(t("common.messages.copyFailed"))
    }
  }

  const label = copied ? t("models.specs.slugCopied") : t("models.specs.copySlug")

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-5 shrink-0 text-muted-foreground/70 hover:text-foreground"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation()
        void copy()
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
    </Button>
  )
}

export function ModelIdentity({ model, name }: { model: LLMModel; name: string }) {
  const showSlug = Boolean(model.slug) && name !== model.slug
  if (!showSlug) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <p className="truncate font-mono text-sm font-medium leading-snug text-foreground">{name}</p>
        {model.slug ? <CopySlugButton slug={model.slug} /> : null}
      </div>
    )
  }
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium leading-snug text-foreground">{name}</p>
      <div className="mt-0.5 flex min-w-0 items-center gap-1">
        <code className="truncate font-mono text-xs leading-tight text-muted-foreground">
          {model.slug}
        </code>
        <CopySlugButton slug={model.slug} />
      </div>
    </div>
  )
}

export function ExpandControl({
  expanded,
  name,
  detailsId,
  onToggle,
}: {
  expanded: boolean
  name: string
  detailsId: string
  onToggle: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      tabIndex={0}
      aria-expanded={expanded}
      aria-controls={detailsId}
      aria-label={t(expanded ? "models.collapse" : "models.expand", { name })}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          event.stopPropagation()
          onToggle()
        }
      }}
      className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
    >
      <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden />
    </div>
  )
}
