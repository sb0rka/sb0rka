import { useMemo, useRef, useState, type FormEvent } from "react"
import { useQueries } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { LayoutGrid, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/features/auth/auth-provider"
import { formatDraftTagLabel } from "../parse-draft-tag"
import {
  getDatabase,
  getResourceMetricTimeseries,
  type DatabaseResponse,
  type ResourceMetricTimeseries,
} from "../api"
import { AddTagDialog } from "./add-tag-dialog"
import { DatabasesTable } from "./databases-table"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import type {
  CreateDatabaseFormActions,
  CreateDatabaseFormState,
  DatabaseRow,
} from "./project-detail-tab-types"
import { useToast } from "@/components/toast-provider"

const DATABASE_STATUS_POLL_INTERVAL_MS = 3000
const DISK_USAGE_RATE_STALE_MS = 1000 * 60 * 5

function isFinalSyncState(syncState?: string): boolean {
  return syncState === "synced" || syncState === "failed"
}

interface DatabasesTabProps {
  projectId: string
  databases: DatabaseResponse[]
  resourceTimestampsById: Record<string, { createdAt?: string; updatedAt?: string }>
  createForm: CreateDatabaseFormState
  createActions: CreateDatabaseFormActions
  onOpenDatabaseDetails: (resourceId: string) => void
}

export function DatabasesTab({
  projectId,
  databases,
  resourceTimestampsById,
  createForm,
  createActions,
  onOpenDatabaseDetails,
}: DatabasesTabProps) {
  const { t } = useTranslation()
  const { isAuthenticated } = useAuth()
  const dbNameInputRef = useRef<HTMLInputElement>(null)
  const createDatabaseCardRef = useRef<HTMLDivElement>(null)
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)
  const {showSuccess} = useToast()

  const databaseDetailsQueries = useQueries({
    queries: databases.map((database) => ({
      queryKey: ["projects", projectId, "resources", database.resource_id, "database"],
      queryFn: () => getDatabase(projectId, database.resource_id),
      enabled: !!projectId,
      refetchInterval: (query: {
        state: { data?: Awaited<ReturnType<typeof getDatabase>> }
      }) => {
        const syncState = query.state.data?.sync_state
        return isFinalSyncState(syncState) ? false : DATABASE_STATUS_POLL_INTERVAL_MS
      },
    })),
  })
  const diskUsageRateQueries = useQueries({
    queries: databases.map((database) => ({
      queryKey: [
        "projects",
        projectId,
        "resources",
        database.resource_id,
        "observability",
        "timeseries",
        "db_size_rate",
      ],
      queryFn: async (): Promise<ResourceMetricTimeseries | null> => {
        try {
          return await getResourceMetricTimeseries(
            projectId,
            database.resource_id,
            "db_size_rate",
          )
        } catch {
          return null
        }
      },
      enabled: isAuthenticated && !!projectId,
      staleTime: DISK_USAGE_RATE_STALE_MS,
    })),
  })
  const databaseDetailsById = useMemo(() => {
    const details = new Map<string, Awaited<ReturnType<typeof getDatabase>>>()
    for (const query of databaseDetailsQueries) {
      if (!query.data) continue
      details.set(query.data.resource_id, query.data)
    }
    return details
  }, [databaseDetailsQueries])
  const databaseRows: DatabaseRow[] = useMemo(
    () =>
      databases.map((databaseFromList, index) => {
        const database = databaseDetailsById.get(databaseFromList.resource_id) ?? databaseFromList
        const rateSeries = diskUsageRateQueries[index]?.data
        let diskUsageLabel = "—"
        const lastValue = rateSeries?.points.at(-1)?.value
        if (lastValue !== undefined && !Number.isNaN(lastValue)) {
          diskUsageLabel = `${lastValue.toFixed(2)}%`
        }

        return {
          id: databaseFromList.resource_id,
          name: databaseFromList.name,
          description: databaseFromList.description,
          tablesCount: Math.max(databaseFromList.next_table_id - 1, 0),
          columnsCount: "—",
          syncState: database.sync_state,
          desiredState: database.desired_state,
          createdAt: resourceTimestampsById[databaseFromList.resource_id]?.createdAt ?? "",
          updatedAt: resourceTimestampsById[databaseFromList.resource_id]?.updatedAt ?? "",
          isHighlighted: index === 0,
          diskUsageLabel,
        }
      }),
    [databaseDetailsById, databases, diskUsageRateQueries, resourceTimestampsById],
  )

  function handleCreateDatabaseSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void createActions.onSubmitCreateDatabase()
  }

  function focusCreateDatabaseSection() {
    createDatabaseCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    window.setTimeout(() => {
      dbNameInputRef.current?.focus({ preventScroll: true })
    }, 350)
  }

  return (
    <TabsContent value="databases" className="mt-2 flex flex-col gap-4">
      <PageStagger className="flex flex-col gap-6">
        <SlideIn className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("databases.singularTitle")}
            </h2>
            <Button
              type="button"
              size="icon"
              className="size-9 shrink-0 rounded-xl md:h-9 md:w-auto md:rounded-md md:px-4"
              onClick={focusCreateDatabaseSection}
              aria-label={t("databases.createTitle")}
            >
              <Plus className="size-4 md:mr-2" aria-hidden />
              <span className="hidden md:inline">{t("databases.createTitle")}</span>
            </Button>
          </div>
          <p className="max-w-[650px] text-sm leading-5 text-muted-foreground">
            {t("databases.description")}
          </p>
        </SlideIn>

        <SlideIn>
        <Card className="overflow-hidden shadow-sm">
          <CardContent className="px-6 pb-6 pt-0">
            <DatabasesTable
              rows={databaseRows}
              emptyMessage={t("databases.empty")}
              onRowClick={(row) => onOpenDatabaseDetails(row.id)}
            />
            <Button
              type="button"
              variant="outline"
              className="mt-4 flex w-full gap-2 md:hidden"
              disabled={databaseRows.length === 0}
              asChild={databaseRows.length > 0}
            >
              {databaseRows.length > 0 ? (
                <Link to={`/projects/${projectId}/mobile-data-explorer`}>
                  <LayoutGrid className="h-4 w-4" />
                  {t("dataExplorer.mobileOpen")}
                </Link>
              ) : (
                <span>
                  <LayoutGrid className="h-4 w-4" />
                  {t("dataExplorer.mobileOpen")}
                </span>
              )}
            </Button>
          </CardContent>
        </Card>
        </SlideIn>

        <SlideIn>
        <Card ref={createDatabaseCardRef} className="overflow-hidden shadow-sm">
          <CardHeader className="gap-1.5 space-y-0 p-6">
            <CardTitle className="text-xl font-semibold leading-5 tracking-[-0.015em]">
              {t("databases.createCardTitle")}
            </CardTitle>
            <CardDescription className="leading-5">{t("databases.engineVersion")}</CardDescription>
          </CardHeader>
          <form onSubmit={handleCreateDatabaseSubmit}>
            <CardContent className="space-y-4 border-b border-border px-6 pb-6 pt-0">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-db-name">{t("common.labels.name")}</Label>
                  <Input
                    id="new-db-name"
                    placeholder={t("databases.namePlaceholder")}
                    value={createForm.newDatabaseName}
                    onChange={(e) => createActions.onNewDatabaseNameChange(e.target.value)}
                    ref={dbNameInputRef}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new-db-description">{t("common.labels.description")}</Label>
                  <Textarea
                    id="new-db-description"
                    placeholder={t("databases.descriptionPlaceholder")}
                    value={createForm.newDatabaseDescription}
                    onChange={(e) => createActions.onNewDatabaseDescriptionChange(e.target.value)}
                    rows={3}
                    className="min-h-20 resize-y"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>{t("common.labels.tags")}</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {createForm.draftTags.map((tag) => (
                    <Badge key={`${tag.tag_key}:${tag.tag_value}`}>{formatDraftTagLabel(tag)}</Badge>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-full px-2.5 text-xs font-semibold"
                    onClick={() => setIsTagModalOpen(true)}
                  >
                    {t("databases.addTag")}
                  </Button>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-row items-center gap-4 px-6 pb-6 pt-6">
              <Button
                type="submit"
                disabled={!createForm.newDatabaseName.trim() || createForm.isCreatePending}
              >
                {createForm.isCreatePending ? t("common.creating") : t("common.actions.create")}
              </Button>
            </CardFooter>
          </form>
        </Card>
        </SlideIn>
      </PageStagger>

      <AddTagDialog
        open={isTagModalOpen}
        onOpenChange={setIsTagModalOpen}
        inputId="modal-draft-tag"
        checkDuplicate={(parsed) =>
          createForm.draftTags.some(
            (tag) => tag.tag_key === parsed.tag_key && tag.tag_value === parsed.tag_value,
          )
            ? t("common.messages.tagDuplicate")
            : null
        }
        onSubmit={(parsed) => {
          createActions.onAddDraftTag(formatDraftTagLabel(parsed))
          showSuccess(t("common.messages.tagAdded"))
        }}
      />
    </TabsContent>
  )
}
