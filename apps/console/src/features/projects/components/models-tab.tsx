import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { KeyRound, Plus } from "lucide-react"
import {
  Button,
  Card,
  CardContent,
  cn,
  TabsContent,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@sb0rka/ui"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import { activeModelsQuery } from "../api"
import { secretsListHref } from "../secret-filters"
import { CreateLlmKeyDialog } from "./create-llm-key-dialog"
import { LlmKeyDetails } from "./llm-key-details"
import { ModelsTable } from "./models-table"

function modelsSearchParams(
  current: URLSearchParams,
  view: { key?: string },
) {
  const next = new URLSearchParams(current)
  next.set("tab", "models")
  next.delete("mode")
  if (view.key) next.set("key", view.key)
  else next.delete("key")
  return next
}

export function ModelsTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const keyId = searchParams.get("key")?.trim() || null
  const query = useQuery(activeModelsQuery)
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const models = useMemo(() => query.data?.models ?? [], [query.data])
  const effectiveSelectedIds = useMemo(() => {
    if (selectedIds !== null) return selectedIds
    return new Set(models.map((model) => model.id))
  }, [models, selectedIds])
  const selectedModels = useMemo(
    () => models.filter((model) => effectiveSelectedIds.has(model.id)),
    [models, effectiveSelectedIds],
  )
  const canCreate = selectedModels.length > 0
  const showCount = !query.isPending && models.length > 0
  const showDisabledHint = !canCreate && showCount

  function openOverview() {
    setDialogOpen(false)
    setSelectedIds(null)
    setSearchParams(modelsSearchParams(searchParams, {}))
  }

  function openKey(id: string) {
    setDialogOpen(false)
    setSelectedIds(null)
    setSearchParams(modelsSearchParams(searchParams, { key: id }))
  }

  const addKeyButton = (
    <Button type="button" disabled={!canCreate} onClick={() => setDialogOpen(true)}>
      <Plus className="mr-2 size-4" aria-hidden />
      <span>{t("models.keys.add")}</span>
      {showCount ? (
        <span
          className={cn(
            "ml-1 inline-flex h-[18px] -translate-y-1 items-center justify-center rounded-full font-mono text-[10px] font-medium leading-none tabular-nums",
            selectedModels.length > 9 ? "min-w-[18px] px-1" : "w-[18px]",
            canCreate
              ? "bg-primary-foreground/20 text-primary-foreground"
              : "bg-primary-foreground/10 text-primary-foreground/70",
          )}
        >
          {selectedModels.length}
        </span>
      ) : null}
    </Button>
  )

  return (
    <TabsContent
      value="models"
      className={cn(
        "flex flex-col gap-6 data-[state=inactive]:hidden",
        !keyId &&
          "h-[calc(100dvh-11rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] min-h-0 overflow-hidden md:h-[calc(100dvh-7.25rem)]",
      )}
    >
      {keyId ? (
        <LlmKeyDetails projectId={projectId} keyId={keyId} onClose={openOverview} />
      ) : (
        <PageStagger className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
          <SlideIn className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold tracking-tight">{t("tabs.models")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("models.createViewDescription")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start">
              <Button variant="outline" asChild>
                <Link to={secretsListHref(projectId, "llm")}>
                  <KeyRound className="mr-2 size-4" aria-hidden />
                  {t("models.keys.title")}
                </Link>
              </Button>
              {showDisabledHint ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex" tabIndex={0}>
                      {addKeyButton}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{t("models.createDisabledHint")}</TooltipContent>
                </Tooltip>
              ) : addKeyButton}
            </div>
          </SlideIn>
          <SlideIn className="flex h-0 min-h-0 flex-1 flex-col">
            <Card className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
              <CardContent className="flex h-0 min-h-0 flex-1 flex-col p-0">
                <ModelsTable
                  models={models}
                  isLoading={query.isPending}
                  isError={query.isError && !query.data}
                  onRetry={() => { void query.refetch() }}
                  selection={{ selectedIds: effectiveSelectedIds, onChange: setSelectedIds }}
                  filterable
                  searchable
                  layout="fill"
                />
              </CardContent>
            </Card>
          </SlideIn>
        </PageStagger>
      )}
      {keyId ? null : (
        <CreateLlmKeyDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          projectId={projectId}
          models={selectedModels}
          onRemoveModel={(id) => {
            setSelectedIds((current) => {
              const next = new Set(current ?? models.map((model) => model.id))
              next.delete(id)
              return next
            })
          }}
          onDone={openKey}
        />
      )}
    </TabsContent>
  )
}
