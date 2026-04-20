import { useRef, type FormEvent, type KeyboardEvent } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"
import { DatabasesTable } from "./databases-table"
import type {
  CreateDatabaseFormActions,
  CreateDatabaseFormState,
  DatabaseRow,
} from "./project-detail-tab-types"

interface DatabasesTabProps {
  databaseRows: DatabaseRow[]
  createForm: CreateDatabaseFormState
  createActions: CreateDatabaseFormActions
  onOpenDatabaseDetails: (resourceId: string) => void
}

export function DatabasesTab({
  databaseRows,
  createForm,
  createActions,
  onOpenDatabaseDetails,
}: DatabasesTabProps) {
  const dbNameInputRef = useRef<HTMLInputElement>(null)

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
          <h2 className="text-2xl font-semibold tracking-tight">База данных</h2>
          <p className="text-sm text-muted-foreground">
            Управляйте данными с легкостью: создавайте, храните и обрабатывайте их.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <DatabasesTable
            rows={databaseRows}
            emptyMessage="Нет баз данных"
            onRowClick={(row) => onOpenDatabaseDetails(row.id)}
          />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="gap-1.5">
          <CardTitle className="text-xl font-semibold leading-5 tracking-[-0.015em]">
            Создать новую базу данных
          </CardTitle>
          <CardDescription className="leading-5">PostgreSQL v18.3</CardDescription>
        </CardHeader>
        <form onSubmit={handleCreateDatabaseSubmit}>
          <CardContent className="space-y-4 pb-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-db-name">Название</Label>
                <Input
                  id="new-db-name"
                  placeholder="Введите название базы данных"
                  value={createForm.newDatabaseName}
                  onChange={(e) => createActions.onNewDatabaseNameChange(e.target.value)}
                  ref={dbNameInputRef}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-db-description">Описание</Label>
                <Input
                  id="new-db-description"
                  placeholder="Добавьте описание базы данных"
                  value={createForm.newDatabaseDescription}
                  onChange={(e) =>
                    createActions.onNewDatabaseDescriptionChange(e.target.value)
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Теги</Label>
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
                  + добавить тег
                </Button>
              </div>
              <Input
                placeholder="Например: env:production"
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
              {createForm.isCreatePending ? "Создание…" : "Создать"}
            </Button>
          </div>
        </form>
      </Card>
    </TabsContent>
  )
}
