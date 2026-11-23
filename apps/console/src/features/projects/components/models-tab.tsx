import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
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
import { CreateLlmKeyDialog } from "./create-llm-key-dialog"
import { ModelsTable } from "./models-table"

export function ModelsTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const query = useQuery(activeModelsQuery)
  // null means the user has not touched the checkboxes yet, so every loaded model stays selected.
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
        "h-[calc(100dvh-11rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] min-h-0 overflow-hidden md:h-[calc(100dvh-7.25rem)]",
      )}
    >
      <PageStagger className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
        <SlideIn className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">{t("tabs.models")}</h2>
            <p className="text-sm text-muted-foreground">{t("models.description")}</p>
          </div>
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
      />
    </TabsContent>
  )
}
