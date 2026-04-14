import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ApiError } from "@/lib/api-client"
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
import {
  useDatabase,
  useDatabaseUri,
  useDeactivateResource,
  useProject,
  useResourceTags,
  useUpdateDatabase,
} from "./hooks"

function formatDate(value?: string): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("sv-SE").format(date)
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message || fallback
  }
  if (error instanceof Error) {
    return error.message || fallback
  }
  return fallback
}

export function DatabaseDetailPage() {
  const { id = "", resourceId = "" } = useParams<{
    id: string
    resourceId: string
  }>()
  const navigate = useNavigate()
  const normalizedResourceId = resourceId.trim()
  const isValidResourceId = normalizedResourceId.length > 0

  const { data: project } = useProject(id)
  const databaseQuery = useDatabase(id, isValidResourceId ? normalizedResourceId : undefined)
  const tagsQuery = useResourceTags(id, isValidResourceId ? normalizedResourceId : undefined)
  const updateDatabase = useUpdateDatabase(
    id,
    isValidResourceId ? normalizedResourceId : undefined,
  )
  const deactivateResource = useDeactivateResource(
    id,
    isValidResourceId ? normalizedResourceId : undefined,
  )

  const [isUriVisible, setIsUriVisible] = useState(false)
  const databaseUri = useDatabaseUri(
    id,
    isValidResourceId ? normalizedResourceId : undefined,
    isUriVisible,
  )

  const [description, setDescription] = useState("")
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    setDescription(databaseQuery.data?.description ?? "")
  }, [databaseQuery.data?.description])

  const hasDescriptionChange =
    description.trim() !== (databaseQuery.data?.description ?? "").trim()

  const maskedUri = useMemo(() => {
    if (!databaseUri.data) {
      return "postgres://********.*****:123456.psql.sb0rka.ru/my-db"
    }
    if (!isUriVisible) {
      return databaseUri.data.replace(/\/\/([^@]+)@/, "//********:********@")
    }
    return databaseUri.data
  }, [databaseUri.data, isUriVisible])

  async function handleSave() {
    if (!hasDescriptionChange || updateDatabase.isPending) return

    setSaveError(null)
    setSaveSuccess(null)
    try {
      await updateDatabase.mutateAsync({
        description,
      })
      setSaveSuccess("Изменения сохранены")
    } catch (error) {
      setSaveError(getErrorMessage(error, "Не удалось сохранить изменения"))
    }
  }

  async function handleDeactivate() {
    if (deactivateResource.isPending) return

    const confirmed = window.confirm(
      "Удалить базу данных и деактивировать связанный ресурс?",
    )
    if (!confirmed) return

    setDeleteError(null)
    try {
      await deactivateResource.mutateAsync()
      window.alert("База данных деактивирована")
      navigate(`/projects/${id}?tab=databases`)
    } catch (error) {
      setDeleteError(
        getErrorMessage(error, "Не удалось удалить базу данных. Попробуйте снова."),
      )
    }
  }

  if (!isValidResourceId) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-destructive">Некорректный идентификатор базы данных.</p>
        <div>
          <Button variant="outline" onClick={() => navigate(`/projects/${id}?tab=databases`)}>
            Назад к списку баз
          </Button>
        </div>
      </div>
    )
  }

  if (databaseQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка базы данных…</p>
  }

  if (databaseQuery.isError || !databaseQuery.data) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-destructive">
          {getErrorMessage(databaseQuery.error, "Не удалось загрузить базу данных.")}
        </p>
        <div>
          <Button variant="outline" onClick={() => navigate(`/projects/${id}?tab=databases`)}>
            Назад к списку баз
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{databaseQuery.data.name}</h1>
          <Badge className="bg-lime-700 text-lime-100 hover:bg-lime-700">Онлайн</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tagsQuery.data?.tags.map((tag) => (
            <Badge key={tag.id}>{`${tag.tag_key}:${tag.tag_value}`}</Badge>
          ))}
          <Badge className="border border-border bg-transparent text-foreground">
            + добавить тег
          </Badge>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="grid gap-6 px-6 py-6 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-foreground">Дата создания</p>
            <p className="text-base text-muted-foreground">{formatDate(project?.created_at)}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-foreground">Дата изменения</p>
            <p className="text-base text-muted-foreground">{formatDate(project?.updated_at)}</p>
          </div>
        </CardContent>
        <div className="border-t border-border px-6 pb-6">
          <div className="flex flex-col gap-1.5 pt-6">
            <Label htmlFor="database-description">Описание</Label>
            <Input
              id="database-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Добавьте описание базы данных"
            />
          </div>
        </div>
        <CardFooter className="border-t border-border pt-6">
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleSave}
              disabled={!hasDescriptionChange || updateDatabase.isPending}
            >
              {updateDatabase.isPending ? "Сохранение…" : "Сохранить изменения"}
            </Button>
            {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
            {saveSuccess ? <p className="text-sm text-emerald-600">{saveSuccess}</p> : null}
          </div>
        </CardFooter>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-4">
          <CardTitle className="text-3xl font-semibold tracking-tight">URI</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3 pb-6">
          <div className="min-w-0 flex-1 rounded-md bg-secondary px-3.5 py-2.5">
            <p className="truncate font-mono text-xs font-semibold text-muted-foreground">
              {maskedUri}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => setIsUriVisible((prev) => !prev)}
            disabled={databaseUri.isFetching}
          >
            {isUriVisible ? "Скрыть" : "Показать"}
          </Button>
        </CardContent>
        {databaseUri.isError ? (
          <CardFooter className="pt-0">
            <p className="text-sm text-destructive">
              {getErrorMessage(databaseUri.error, "Не удалось получить URI.")}
            </p>
          </CardFooter>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border pb-6">
          <CardTitle className="text-3xl font-semibold tracking-tight">Опасная зона</CardTitle>
          <CardDescription>
            Перманентно удалить базу данных и все связанные с ней данные.
          </CardDescription>
        </CardHeader>
        <CardFooter className="pt-6">
          <div className="flex flex-col gap-2">
            <Button
              variant="destructive"
              onClick={handleDeactivate}
              disabled={deactivateResource.isPending}
            >
              {deactivateResource.isPending
                ? "Удаление…"
                : "Удалить базу данных"}
            </Button>
            {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
