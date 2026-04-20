import { useEffect, useState, type KeyboardEvent } from "react"
import { Copy } from "lucide-react"
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
import {
  useAttachResourceTag,
  useDeactivateResource,
  useResourceTags,
  useRevealSecretValue,
} from "../hooks"
import type { SecretRow } from "./project-detail-tab-types"

interface SecretDetailsProps {
  projectId: string
  secret: SecretRow
  onClose: () => void
}

function formatDateTime(value?: string): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date)
}

function parseTagInput(input: string): { tag_key: string; tag_value: string } | null {
  const normalized = input.trim()
  if (!normalized) return null

  const separatorIndex = normalized.indexOf(":")
  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
    return null
  }

  const tag_key = normalized.slice(0, separatorIndex).trim()
  const tag_value = normalized.slice(separatorIndex + 1).trim()
  if (!tag_key || !tag_value) return null

  return { tag_key, tag_value }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export function SecretDetails({ projectId, secret, onClose }: SecretDetailsProps) {
  const tagsQuery = useResourceTags(projectId, secret.id)
  const attachResourceTag = useAttachResourceTag(projectId)
  const revealSecret = useRevealSecretValue(projectId, secret.id)
  const deactivateResource = useDeactivateResource(projectId, secret.id)

  const [isValueVisible, setIsValueVisible] = useState(false)
  const [revealedValue, setRevealedValue] = useState<string | null>(null)
  const [revealError, setRevealError] = useState<string | null>(null)
  const [newTagInput, setNewTagInput] = useState("")
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [tagActionError, setTagActionError] = useState<string | null>(null)
  const [tagActionSuccess, setTagActionSuccess] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [copySecretMessage, setCopySecretMessage] = useState<string | null>(null)

  useEffect(() => {
    setIsValueVisible(false)
    setRevealedValue(null)
    setRevealError(null)
    setNewTagInput("")
    setIsAddingTag(false)
    setTagActionError(null)
    setTagActionSuccess(null)
    setDeleteError(null)
    setCopySecretMessage(null)
  }, [secret.id])

  async function handleToggleSecretValue() {
    if (isValueVisible) {
      setIsValueVisible(false)
      setCopySecretMessage(null)
      return
    }

    setRevealError(null)

    if (!revealedValue) {
      try {
        const response = await revealSecret.mutateAsync()
        setRevealedValue(response.secret_value)
      } catch (error) {
        setRevealError(getErrorMessage(error, "Не удалось получить значение секрета"))
        return
      }
    }

    setIsValueVisible(true)
  }

  async function handleCopySecretValue() {
    if (!revealedValue || revealSecret.isPending) return
    try {
      await navigator.clipboard.writeText(revealedValue)
      setCopySecretMessage("Секрет скопирован")
      window.setTimeout(() => setCopySecretMessage(null), 2000)
    } catch {
      setCopySecretMessage("Не удалось скопировать")
      window.setTimeout(() => setCopySecretMessage(null), 3000)
    }
  }

  async function handleAddTag() {
    if (attachResourceTag.isPending) return

    setTagActionError(null)
    setTagActionSuccess(null)

    const parsed = parseTagInput(newTagInput)
    if (!parsed) {
      setTagActionError("Тег должен быть в формате key:value")
      return
    }

    const duplicate = tagsQuery.data?.tags.some(
      (tag) => tag.tag_key === parsed.tag_key && tag.tag_value === parsed.tag_value,
    )
    if (duplicate) {
      setTagActionError("Такой тег уже добавлен")
      return
    }

    try {
      await attachResourceTag.mutateAsync({
        resourceId: secret.id,
        data: parsed,
      })
      setTagActionSuccess("Тег добавлен")
      setNewTagInput("")
      setIsAddingTag(false)
    } catch (error) {
      setTagActionError(getErrorMessage(error, "Не удалось добавить тег"))
    }
  }

  function handleTagInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault()
      void handleAddTag()
    }
    if (event.key === "Escape") {
      setIsAddingTag(false)
      setNewTagInput("")
      setTagActionError(null)
    }
  }

  async function handleDeleteSecret() {
    if (deactivateResource.isPending) return

    const confirmed = window.confirm("Удалить секрет и деактивировать связанный ресурс?")
    if (!confirmed) return

    setDeleteError(null)
    try {
      await deactivateResource.mutateAsync()
      window.alert("Секрет удален")
      onClose()
    } catch (error) {
      setDeleteError(getErrorMessage(error, "Не удалось удалить секрет. Попробуйте снова."))
    }
  }

  const maskedValue = "•••••••••••••••••••••••"
  const displayedValue =
    isValueVisible && revealedValue ? `${revealedValue}` : maskedValue

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-2xl font-semibold tracking-tight">{secret.name}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {tagsQuery.data?.tags.map((tag) => (
            <Badge
              key={tag.id}
              className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold leading-4 text-secondary-foreground hover:bg-secondary"
            >
              {`${tag.tag_key}:${tag.tag_value}`}
            </Badge>
          ))}
          {isAddingTag ? (
            <div className="flex items-center gap-2">
              <Input
                placeholder="key:value"
                value={newTagInput}
                onChange={(event) => setNewTagInput(event.target.value)}
                onKeyDown={handleTagInputKeyDown}
                className="h-8 w-[180px]"
                autoFocus
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleAddTag()}
                disabled={attachResourceTag.isPending}
              >
                Добавить
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsAddingTag(false)
                  setNewTagInput("")
                  setTagActionError(null)
                }}
              >
                Отмена
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-5 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-4"
              onClick={() => {
                setIsAddingTag(true)
                setTagActionError(null)
                setTagActionSuccess(null)
              }}
            >
              + добавить тег
            </Button>
          )}
        </div>
        {tagActionError ? <p className="text-sm text-destructive">{tagActionError}</p> : null}
        {tagActionSuccess ? <p className="text-sm text-emerald-600">{tagActionSuccess}</p> : null}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="grid gap-6 px-6 py-6 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-foreground">Дата создания</p>
            <p className="text-base text-muted-foreground">{secret.createdAt}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-foreground">Дата изменения</p>
            <p className="text-base text-muted-foreground">{formatDateTime(secret.updatedAt)}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-4">
          <CardTitle className="text-[20px] font-semibold tracking-tight">Секрет</CardTitle>
          <CardDescription>
            {`Последний просмотр: ${formatDateTime(secret.revealedAt)}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5 pb-6">
          <p className="text-sm font-medium text-foreground">Ключ</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1 rounded-md border border-input px-3 py-2">
              <p className="truncate text-base text-foreground">{displayedValue}</p>
            </div>
            {isValueVisible ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => void handleCopySecretValue()}
                disabled={!revealedValue || revealSecret.isPending}
                title="Копировать секрет"
                aria-label="Копировать секрет"
              >
                <Copy className="h-4 w-4" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleToggleSecretValue()}
              disabled={revealSecret.isPending}
            >
              {revealSecret.isPending
                ? "Загрузка…"
                : isValueVisible
                  ? "Скрыть"
                  : "Просмотреть"}
            </Button>
          </div>
          {isValueVisible && copySecretMessage ? (
            <p
              className={
                copySecretMessage === "Секрет скопирован"
                  ? "text-sm text-emerald-600"
                  : "text-sm text-destructive"
              }
            >
              {copySecretMessage}
            </p>
          ) : null}
          {revealError ? <p className="text-sm text-destructive">{revealError}</p> : null}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border pb-6">
          <CardTitle className="text-[20px] font-semibold tracking-tight">Опасная зона</CardTitle>
          <CardDescription>
            Безвозвратно удалить секрет.
          </CardDescription>
        </CardHeader>
        <CardFooter className="pt-6">
          <div className="flex flex-col gap-2">
            <Button
              className="self-start"
              variant="destructive"
              onClick={() => void handleDeleteSecret()}
              disabled={deactivateResource.isPending}
            >
              {deactivateResource.isPending ? "Удаление…" : "Удалить секрет"}
            </Button>
            {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
