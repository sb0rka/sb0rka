import { useTranslation } from "react-i18next"
import { Plus } from "lucide-react"
import { Button, cn } from "@sb0rka/ui"
import { modelDisplayName } from "../models-utils"
import type { ProjectLlmKey } from "../hooks"

const KEYS_TABLE_GRID =
  "grid w-full grid-cols-[minmax(12rem,0.7fr)_minmax(0,1.4fr)] items-stretch"

function ModelsSummary({ item }: { item: ProjectLlmKey }) {
  const { t } = useTranslation()
  if (item.modelsPending) {
    return <span className="text-sm text-muted-foreground">{t("common.loading")}</span>
  }
  if (item.models.length === 0) {
    return <span className="text-sm text-muted-foreground">{t("models.keys.noModels")}</span>
  }
  return (
    <p className="truncate text-sm text-foreground">
      {item.models.map((model) => modelDisplayName(model)).join(", ")}
    </p>
  )
}

function KeyRow({
  item,
  isLast,
  onOpen,
}: {
  item: ProjectLlmKey
  isLast: boolean
  onOpen: (id: string) => void
}) {
  const { t } = useTranslation()

  return (
    <div
      tabIndex={0}
      aria-label={t("models.keys.open", { name: item.name })}
      onClick={() => onOpen(item.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen(item.id)
        }
      }}
      className={cn(
        KEYS_TABLE_GRID,
        "cursor-pointer outline-none hover:bg-muted/50 focus-visible:bg-muted/50",
        !isLast && "border-b border-border",
      )}
    >
      <div className="flex min-h-14 min-w-0 items-center px-4 py-3">
        <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
      </div>
      <div className="flex min-h-14 min-w-0 items-center px-4 py-3">
        <ModelsSummary item={item} />
      </div>
    </div>
  )
}

function MobileKeyRow({ item, onOpen }: { item: ProjectLlmKey; onOpen: (id: string) => void }) {
  const { t } = useTranslation()

  return (
    <div
      tabIndex={0}
      aria-label={t("models.keys.open", { name: item.name })}
      onClick={() => onOpen(item.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen(item.id)
        }
      }}
      className="cursor-pointer border-b border-border px-4 py-3 outline-none last:border-b-0 hover:bg-muted/50 focus-visible:bg-muted/50"
    >
      <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
      <div className="mt-2">
        <ModelsSummary item={item} />
      </div>
    </div>
  )
}

export function LlmKeysList({
  keys,
  isLoading,
  isError,
  onRetry,
  onOpen,
  onCreate,
}: {
  keys: ProjectLlmKey[]
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  onOpen: (id: string) => void
  onCreate: () => void
}) {
  const { t } = useTranslation()

  if (isLoading) {
    return <p role="status" className="px-6 py-8 text-sm text-muted-foreground">{t("common.loading")}</p>
  }

  if (isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 px-6 py-8">
        <p className="text-sm text-destructive">{t("models.keys.loadError")}</p>
        <Button type="button" variant="outline" onClick={onRetry}>
          {t("models.retry")}
        </Button>
      </div>
    )
  }

  if (keys.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-foreground">{t("models.keys.empty")}</p>
        <Button type="button" onClick={onCreate}>
          <Plus className="mr-2 size-4" aria-hidden />
          {t("models.keys.add")}
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="md:hidden">
        {keys.map((item) => (
          <MobileKeyRow key={item.id} item={item} onOpen={onOpen} />
        ))}
      </div>
      <div className="hidden md:block">
        <div className={cn(KEYS_TABLE_GRID, "border-b border-border text-sm font-medium text-muted-foreground")}>
          <div className="flex h-12 items-center px-4">{t("common.labels.name")}</div>
          <div className="flex h-12 items-center px-4">{t("models.keys.columns.models")}</div>
        </div>
        {keys.map((item, index) => (
          <KeyRow
            key={item.id}
            item={item}
            isLast={index === keys.length - 1}
            onOpen={onOpen}
          />
        ))}
      </div>
    </>
  )
}
