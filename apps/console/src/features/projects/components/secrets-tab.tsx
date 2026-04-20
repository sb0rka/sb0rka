import { useState, type FormEvent } from "react"
import { useSearchParams } from "react-router-dom"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"
import { ApiError } from "@/lib/api-client"
import type { CreateSecretRequest } from "../api"
import type { SecretRow } from "./project-detail-tab-types"
import { SecretDetails } from "./secret-details"
import { SecretDetailsTable } from "./secret-details-table"

interface SecretsTabProps {
  projectId: string
  secretRows: SecretRow[]
  isCreateSecretPending: boolean
  onCreateSecret: (data: CreateSecretRequest) => Promise<void>
}

export function SecretsTab({
  projectId,
  secretRows,
  isCreateSecretPending,
  onCreateSecret,
}: SecretsTabProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newSecretName, setNewSecretName] = useState("")
  const [newSecretDescription, setNewSecretDescription] = useState("")
  const [newSecretValue, setNewSecretValue] = useState("")
  const [createSecretError, setCreateSecretError] = useState<string | null>(null)
  const openedSecretId = searchParams.get("secret")

  const openedSecret =
    openedSecretId !== null
      ? secretRows.find((secret) => secret.id === openedSecretId) ?? null
      : null

  function setOpenedSecretId(secretId: string | null) {
    const next = new URLSearchParams(searchParams)
    next.set("tab", "secrets")
    if (secretId) {
      next.set("secret", secretId)
    } else {
      next.delete("secret")
    }
    setSearchParams(next)
  }

  function resetCreateSecretForm() {
    setNewSecretName("")
    setNewSecretDescription("")
    setNewSecretValue("")
    setCreateSecretError(null)
  }

  function handleCreateDialogOpenChange(next: boolean) {
    if (!next) {
      resetCreateSecretForm()
    }
    setIsCreateDialogOpen(next)
  }

  async function handleCreateSecretSubmit(e: FormEvent) {
    e.preventDefault()
    if (!newSecretName.trim() || !newSecretValue.trim() || isCreateSecretPending) {
      return
    }

    setCreateSecretError(null)

    try {
      await onCreateSecret({
        name: newSecretName.trim(),
        description: newSecretDescription.trim() || undefined,
        secret_value: newSecretValue.trim(),
      })
      handleCreateDialogOpenChange(false)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Не удалось создать секрет"
      setCreateSecretError(message)
    }
  }

  return (
    <TabsContent value="secrets" className="flex flex-col gap-6">
      {openedSecret ? null : (
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-semibold tracking-tight">Секреты</h2>
            <p className="text-sm text-muted-foreground">
              Безопасно храните и организуйте работу с конфиденциальными переменными.
            </p>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Создать секрет
          </Button>
        </div>
      )}

      <Card className={openedSecret ? "overflow-hidden border-0 shadow-none" : "overflow-hidden"}>
        <CardContent className="p-0">
          {openedSecret ? (
            <SecretDetails
              projectId={projectId}
              secret={openedSecret}
              onClose={() => setOpenedSecretId(null)}
            />
          ) : (
            <SecretDetailsTable
              projectId={projectId}
              rows={secretRows}
              emptyMessage="Нет секретов"
              onRowClick={(row) => setOpenedSecretId(row.id)}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogOpenChange}>
        <DialogContent>
          <form onSubmit={handleCreateSecretSubmit} autoComplete="off">
            <DialogHeader>
              <DialogTitle>Создать секрет</DialogTitle>
              <DialogDescription>
                Добавьте защищенное значение для использования в проекте.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 px-6 pb-6">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-secret-name">Название</Label>
                <Input
                  id="new-secret-name"
                  name="secret-name"
                  autoComplete="off"
                  placeholder="Например: STRIPE_KEY"
                  value={newSecretName}
                  onChange={(e) => setNewSecretName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-secret-description">Описание</Label>
                <Input
                  id="new-secret-description"
                  name="secret-description"
                  autoComplete="off"
                  placeholder="Опишите назначение секрета"
                  value={newSecretDescription}
                  onChange={(e) => setNewSecretDescription(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-secret-value">Значение</Label>
                <Input
                  id="new-secret-value"
                  name="secret-value"
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  className="[-webkit-text-security:disc]"
                  placeholder="Введите значение секрета"
                  value={newSecretValue}
                  onChange={(e) => setNewSecretValue(e.target.value)}
                />
              </div>
              {createSecretError ? <p className="text-sm text-destructive">{createSecretError}</p> : null}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleCreateDialogOpenChange(false)}
                disabled={isCreateSecretPending}
              >
                Отменить
              </Button>
              <Button
                type="submit"
                disabled={
                  !newSecretName.trim() || !newSecretValue.trim() || isCreateSecretPending
                }
              >
                {isCreateSecretPending ? "Создание…" : "Создать секрет"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </TabsContent>
  )
}
