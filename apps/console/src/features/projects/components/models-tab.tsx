import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Plus } from "lucide-react"
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  TabsContent,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@sb0rka/ui"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import { activeModelsQuery } from "../api"
import { useProjectLlmKeys } from "../hooks"
import { CreateLlmKeyDialog } from "./create-llm-key-dialog"
import { LlmKeyDetails } from "./llm-key-details"
import { LlmKeysList } from "./llm-keys-list"
import { ModelsTable } from "./models-table"

function modelsSearchParams(
  current: URLSearchParams,
  view: { mode?: "create"; key?: string },
) {
  const next = new URLSearchParams(current)
  next.set("tab", "models")
  if (view.mode) next.set("mode", view.mode)
  else next.delete("mode")
  if (view.key) next.set("key", view.key)
  else next.delete("key")
  return next
}

export function ModelsTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const keyId = searchParams.get("key")?.trim() || null
  const isCreate = !keyId && searchParams.get("mode") === "create"
  const query = useQuery(activeModelsQuery)
  const llmKeys = useProjectLlmKeys(projectId)
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

  function openOverview() {
    setDialogOpen(false)
    setSearchParams(modelsSearchParams(searchParams, {}))
  }

  function openCreate() {
    setDialogOpen(false)
    setSelectedIds(null)
    setSearchParams(modelsSearchParams(searchParams, { mode: "create" }))
  }

  function openKey(id: string) {
    setDialogOpen(false)
    setSearchParams(modelsSearchParams(searchParams, { key: id }))
  }

  const createButton = (
    <Button type="button" disabled={!canCreate} onClick={() => setDialogOpen(true)}>
      {t("models.create")}
    </Button>
  )

  return (
    <TabsContent
      value="models"
      className={cn(
        "flex flex-col gap-6 data-[state=inactive]:hidden",
        isCreate &&
          "h-[calc(100dvh-11rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] min-h-0 overflow-hidden md:h-[calc(100dvh-7.25rem)]",
      )}
    >
      {keyId ? (
        <LlmKeyDetails projectId={projectId} keyId={keyId} onClose={openOverview} />
      ) : isCreate ? (
        <PageStagger className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
          <SlideIn className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <h2 className="min-w-0 text-2xl font-semibold tracking-tight">{t("models.keys.newTitle")}</h2>
            {canCreate ? createButton : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex self-start" tabIndex={0}>
                    {createButton}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t("models.createDisabledHint")}</TooltipContent>
              </Tooltip>
            )}
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
                  layout="fill"
                />
              </CardContent>
            </Card>
          </SlideIn>
        </PageStagger>
      ) : (
        <PageStagger className="flex flex-col gap-6">
          <SlideIn className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <h2 className="text-2xl font-semibold tracking-tight">{t("tabs.models")}</h2>
            <Button type="button" className="self-start" onClick={openCreate}>
              <Plus className="mr-2 size-4" aria-hidden />
              {t("models.keys.add")}
            </Button>
          </SlideIn>
          <SlideIn>
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl">{t("models.keys.title")}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <LlmKeysList
                  keys={llmKeys.keys}
                  isLoading={llmKeys.isLoading}
                  isError={llmKeys.isError}
                  onRetry={llmKeys.refetch}
                  onOpen={openKey}
                  onCreate={openCreate}
                />
              </CardContent>
            </Card>
          </SlideIn>
          <SlideIn>
            <Card className="overflow-hidden">
              <CardHeader className="pb-0">
                <CardTitle className="text-xl">{t("models.catalogTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ModelsTable
                  models={models}
                  isLoading={query.isPending}
                  isError={query.isError && !query.data}
                  onRetry={() => { void query.refetch() }}
                  layout="auto"
                />
              </CardContent>
            </Card>
          </SlideIn>
        </PageStagger>
      )}
      {isCreate ? (
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
      ) : null}
    </TabsContent>
  )
}
