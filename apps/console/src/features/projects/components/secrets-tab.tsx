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
import { cn } from "@/lib/utils"
import { useToast } from "@/components/toast-provider"

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
  const {showSuccess, showError} = useToast()
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


    try {
      await onCreateSecret({
        name: newSecretName.trim(),
        description: newSecretDescription.trim() || undefined,
        secret_value: newSecretValue.trim(),
      })
      handleCreateDialogOpenChange(false)
      showSuccess(t("secrets.createSuccess"))
    } catch (error) {
      const message = error instanceof ApiError ? error.message : t("secrets.createError")
      showError(message)
    }
  }

  const isListView = !openedSecret

  return (
    <TabsContent
      value="secrets"
      className={cn(
        "flex flex-col gap-6",
        isListView &&
          "h-[calc(100dvh-11rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] min-h-0 overflow-hidden md:h-[calc(100dvh-7.25rem)]",
      )}
    >
      <PageStagger
        className={cn(
          "flex flex-col gap-6",
          isListView && "min-h-0 flex-1 overflow-hidden",
        )}
      >
        {openedSecret ? null : (
          <SlideIn className="shrink-0 flex flex-col gap-1">
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

        <SlideIn className={cn(isListView && "flex h-0 min-h-0 flex-1 flex-col")}>
          <Card
            className={cn(
              openedSecret
                ? "overflow-visible border-0 shadow-none"
                : "flex h-0 min-h-0 flex-1 flex-col overflow-hidden",
            )}
          >
            <CardContent className={cn("p-0", isListView && "flex h-0 min-h-0 flex-1 flex-col")}>
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
