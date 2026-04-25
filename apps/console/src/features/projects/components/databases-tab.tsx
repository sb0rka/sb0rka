import { useMemo, useRef, type FormEvent, type KeyboardEvent } from "react"
import { useQueries } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"
import { getDatabase, type DatabaseResponse } from "../api"
import { DatabasesTable } from "./databases-table"
import type {
  CreateDatabaseFormActions,
  CreateDatabaseFormState,
  DatabaseRow,
} from "./project-detail-tab-types"

const DATABASE_STATUS_POLL_INTERVAL_MS = 3000

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
  const dbNameInputRef = useRef<HTMLInputElement>(null)
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
        }
      }),
    [databaseDetailsById, databases, resourceTimestampsById],
  )

  function handleTagInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      createActions.onAddDraftTag()
    }
  }

  function handleCreateDatabaseSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void createActions.onSubmitCreateDatabase()
  }

  return (
    <TabsContent value="databases" className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">{t("databases.singularTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("databases.description")}
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <DatabasesTable
            rows={databaseRows}
            emptyMessage={t("databases.empty")}
            onRowClick={(row) => onOpenDatabaseDetails(row.id)}
          />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="gap-1.5">
          <CardTitle className="text-xl font-semibold leading-5 tracking-[-0.015em]">
            {t("databases.createTitle")}
          </CardTitle>
          <CardDescription className="leading-5">PostgreSQL v18.3</CardDescription>
        </CardHeader>
        <form onSubmit={handleCreateDatabaseSubmit}>
          <CardContent className="space-y-4 pb-6">
            <div className="grid gap-4 md:grid-cols-2">
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
                <Input
                  id="new-db-description"
                  placeholder={t("databases.descriptionPlaceholder")}
                  value={createForm.newDatabaseDescription}
                  onChange={(e) =>
                    createActions.onNewDatabaseDescriptionChange(e.target.value)
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>{t("common.labels.tags")}</Label>
              <div className="flex flex-wrap items-center gap-2 pb-1">
                {createForm.draftTags.map((tag) => (
                  <Badge key={`${tag.tag_key}:${tag.tag_value}`}>{`${tag.tag_key}:${tag.tag_value}`}</Badge>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={createActions.onAddDraftTag}
                >
                  {t("databases.addTag")}
                </Button>
              </div>
              <Input
                placeholder={t("databases.tagExample")}
                value={createForm.newTagInput}
                onChange={(e) => createActions.onNewTagInputChange(e.target.value)}
                onKeyDown={handleTagInputKeyDown}
              />
            </div>
            {createForm.databaseError ? (
              <p className="text-sm text-destructive">{createForm.databaseError}</p>
            ) : null}
            {createForm.databaseSuccess ? (
              <p className="text-sm text-emerald-600">{createForm.databaseSuccess}</p>
            ) : null}
          </CardContent>
          <div className="border-t border-border px-6 py-6">
            <Button
              type="button"
              onClick={() => void createActions.onSubmitCreateDatabase()}
              disabled={
                !createForm.newDatabaseName.trim() || createForm.isCreatePending
              }
            >
              {createForm.isCreatePending ? t("common.creating") : t("common.actions.create")}
            </Button>
          </div>
        </form>
      </Card>
    </TabsContent>
  )
}
