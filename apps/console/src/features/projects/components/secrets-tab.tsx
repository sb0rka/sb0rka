import { useState, type FormEvent } from "react"
import { useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
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
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"

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
  const { t } = useTranslation()
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
      const message = error instanceof ApiError ? error.message : t("secrets.createError")
      setCreateSecretError(message)
    }
  }

  return (
    <TabsContent value="secrets" className="flex flex-col gap-6">
      <PageStagger className="flex flex-col gap-6">
        {openedSecret ? null : (
          <SlideIn className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold tracking-tight">{t("secrets.title")}</h2>
              <Button
                type="button"
                size="icon"
                className="size-9 shrink-0 rounded-xl md:h-9 md:w-auto md:rounded-md md:px-4"
                onClick={() => setIsCreateDialogOpen(true)}
                aria-label={t("secrets.create")}
              >
                <Plus className="size-4 md:mr-2" aria-hidden />
                <span className="hidden md:inline">{t("secrets.create")}</span>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("secrets.description")}
            </p>
          </SlideIn>
        )}

        <SlideIn>
          <Card className={openedSecret ? "overflow-visible border-0 shadow-none" : "overflow-hidden"}>
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
                  emptyMessage={t("secrets.empty")}
                  onRowClick={(row) => setOpenedSecretId(row.id)}
                />
              )}
            </CardContent>
          </Card>
        </SlideIn>
      </PageStagger>

      <Dialog open={isCreateDialogOpen} onOpenChange={handleCreateDialogOpenChange}>
        <DialogContent>
          <form onSubmit={handleCreateSecretSubmit} autoComplete="off">
            <DialogHeader>
              <DialogTitle>{t("secrets.create")}</DialogTitle>
              <DialogDescription>
                {t("secrets.createDescription")}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 px-6 pb-6">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-secret-name">{t("common.labels.name")}</Label>
                <Input
                  id="new-secret-name"
                  name="secret-name"
                  autoComplete="off"
                  placeholder={t("secrets.nameExample")}
                  value={newSecretName}
                  onChange={(e) => setNewSecretName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-secret-description">{t("common.labels.description")}</Label>
                <Input
                  id="new-secret-description"
                  name="secret-description"
                  autoComplete="off"
                  placeholder={t("secrets.descriptionPlaceholder")}
                  value={newSecretDescription}
                  onChange={(e) => setNewSecretDescription(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-secret-value">{t("secrets.valueLabel")}</Label>
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
                  placeholder={t("secrets.valuePlaceholder")}
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
                {t("common.actions.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={
                  !newSecretName.trim() || !newSecretValue.trim() || isCreateSecretPending
                }
              >
                {isCreateSecretPending ? t("common.creating") : t("secrets.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </TabsContent>
  )
}
