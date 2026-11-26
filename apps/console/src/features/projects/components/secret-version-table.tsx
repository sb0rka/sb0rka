import { useCallback, useEffect, useRef, useState } from "react"
import { Copy, Eye, EyeOff, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge, Button, FloatingHint, ScrollArea, ScrollBar, cn } from "@sb0rka/ui"
import { useConfirmDialog } from "@/components/confirm-dialog-provider"
import { useToast } from "@sb0rka/ui"
import { formatDateTime } from "@/lib/format-date"
import { useDisableSecret, useRevealSecretVersionValue } from "../hooks"
import type { SecretVersionResponse } from "../api"
import { getErrorMessage, useCopyHint } from "./secret-detail-helpers"

export const VERSION_TABLE_COLUMNS =
  "md:grid-cols-[minmax(5.5rem,9%)_minmax(0,1fr)_minmax(7rem,16%)_minmax(11rem,18%)]"

export function SecretVersionRow({
  projectId,
  secretId,
  secretName,
  version,
  isLastRow,
}: {
  projectId: string
  secretId: string
  secretName: string
  version: SecretVersionResponse
  isLastRow: boolean
}) {
  const { t } = useTranslation()
  const confirm = useConfirmDialog()

  const disableSecret = useDisableSecret(projectId, secretId)
  const { showSuccess, showError } = useToast()
  const { message: copyMessage, copy: copyText, clear: clearCopyHint } = useCopyHint()

  const [visible, setVisible] = useState(false)
  const revealSecretVersionValue = useRevealSecretVersionValue(
    projectId,
    secretId,
    version.version_no,
  )
  const resetRevealedVersion = revealSecretVersionValue.reset

  const clearRevealedVersion = useCallback(() => {
    setVisible(false)
    resetRevealedVersion()
    clearCopyHint()
  }, [clearCopyHint, resetRevealedVersion])

  useEffect(() => {
    clearRevealedVersion()
  }, [version.version_no, clearRevealedVersion])

  async function handleDisableSecret(versionNo: number) {
    if (disableSecret.isPending) return

    const confirmed = await confirm({
      title: t("secrets.disableVersionTitle", { version: version.version_no }),
      description: t("secrets.disableVersionDescription"),
    })
    if (!confirmed) return

    try {
      await disableSecret.mutateAsync(versionNo)
      clearRevealedVersion()
      showSuccess(t("secrets.disabled", { name: secretName, version: versionNo }))
    } catch (error) {
      showError(getErrorMessage(error, t("secrets.disableError")))
    }
  }

  const maskedValue = "•••••••••••••••••••••••"
  const plaintext = revealSecretVersionValue.data?.value
  const displayedValue = visible && plaintext ? plaintext : maskedValue
  const isActive = version.state === "active"
  const canReveal = isActive || version.state === "disabled"

  async function handleToggleSecretValue() {
    if (visible) {
      clearRevealedVersion()
      return
    }

    try {
      const revealed = await revealSecretVersionValue.mutateAsync()
      if (!revealed.value) {
        resetRevealedVersion()
        return
      }
      setVisible(true)
    } catch {
      showError(getErrorMessage(revealSecretVersionValue.error, t("secrets.revealError")))
    }
  }

  async function handleCopySecretValue() {
    if (revealSecretVersionValue.isPending) return

    try {
      if (visible) {
        await copyText(revealSecretVersionValue.data?.value)
        return
      }

      const revealed = await revealSecretVersionValue.mutateAsync()
      await copyText(revealed.value)
      resetRevealedVersion()
    } catch {
      showError(getErrorMessage(revealSecretVersionValue.error, t("secrets.revealError")))
    }
  }

  const statusLabel = isActive ? t("secrets.active") : t("secrets.inactive")
  const statusVariant = isActive ? "active" : "inactive"

  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-center gap-x-3 gap-y-2 overflow-hidden py-3",
        canReveal
          ? "[grid-template-areas:'num_date'_'value_value']"
          : "[grid-template-areas:'num_date']",
        VERSION_TABLE_COLUMNS,
        "md:items-stretch md:gap-0 md:py-0 md:[grid-template-areas:'num_value_status_date']",
        !isLastRow && "border-b border-border md:border-b",
      )}
    >
      <div className="flex min-w-0 items-center gap-3 [grid-area:num] md:min-h-14 md:justify-center md:px-4 md:py-4">
        <p className="text-sm font-medium tabular-nums text-foreground">{version.version_no}</p>
        <Badge className="w-fit shrink-0 md:hidden" variant={statusVariant}>
          {statusLabel}
        </Badge>
      </div>
      <div className="hidden min-h-14 min-w-0 items-center justify-center px-4 py-4 [grid-area:status] md:flex">
        <Badge className="w-fit shrink-0" variant={statusVariant}>
          {statusLabel}
        </Badge>
      </div>
      <div
        className={cn(
          "relative flex min-w-0 flex-wrap items-center gap-2 [grid-area:value] md:min-h-14 md:flex-nowrap md:px-4 md:py-4",
          !canReveal && "hidden md:flex",
        )}
      >
        {canReveal ? (
          <>
            <input
              type="text"
              readOnly
              value={displayedValue}
              aria-label={t("secrets.valueLabel")}
              autoComplete="off"
              spellCheck={false}
              className="h-9 min-w-0 flex-1 basis-0 cursor-text rounded-md border-0 bg-secondary px-2.5 font-mono text-xs font-semibold text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => void handleCopySecretValue()}
              disabled={revealSecretVersionValue.isPending}
              title={t("secrets.copySecret")}
              aria-label={t("secrets.copySecret")}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => void handleToggleSecretValue()}
              disabled={revealSecretVersionValue.isPending}
              aria-label={visible ? t("common.actions.hide") : t("common.actions.show")}
            >
              {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
            {isActive ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => void handleDisableSecret(version.version_no)}
                disabled={disableSecret.isPending}
                title={t("secrets.disableVersion")}
                aria-label={t("secrets.disableVersion")}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : (
              <span className="h-9 w-9 shrink-0" aria-hidden="true" />
            )}
            <FloatingHint message={copyMessage} placement="bottom" align="end" />
          </>
        ) : null}
      </div>
      <p className="min-w-0 max-w-full justify-self-end truncate text-xs text-foreground [grid-area:date] sm:text-sm md:flex md:min-h-14 md:items-center md:justify-center md:justify-self-stretch md:px-4 md:py-4 md:text-center md:text-sm">
        {formatDateTime(version.created_at)}
      </p>
    </div>
  )
}

export function SecretVersionTable({
  projectId,
  secretId,
  secretName,
  versions,
}: {
  projectId: string
  secretId: string
  secretName: string
  versions: SecretVersionResponse[]
}) {
  const { t } = useTranslation()
  const headerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const viewport = viewportRef.current
    const header = headerRef.current
    if (!viewport || !header) return
    const sync = () => {
      header.style.transform = `translateX(-${viewport.scrollLeft}px)`
    }
    sync()
    viewport.addEventListener("scroll", sync, { passive: true })
    return () => viewport.removeEventListener("scroll", sync)
  }, [versions.length])

  return (
    <div className="flex min-w-0 flex-col">
      <div className="hidden shrink-0 overflow-hidden md:block">
        <div
          ref={headerRef}
          className={cn(VERSION_TABLE_COLUMNS, "grid w-full min-w-[860px] border-b border-border pr-3")}
        >
          <div className="flex h-12 min-w-0 items-center justify-center px-4 text-sm font-medium text-muted-foreground">
            {t("secrets.version")}
          </div>
          <div className="flex h-12 min-w-0 items-center px-4 text-sm font-medium text-muted-foreground">
            {t("secrets.valueLabel")}
          </div>
          <div className="flex h-12 min-w-0 items-center justify-center px-4 text-sm font-medium text-muted-foreground">
            {t("common.labels.status")}
          </div>
          <div className="flex h-12 min-w-0 items-center justify-center px-4 text-sm font-medium text-muted-foreground">
            {t("common.labels.createdAt")}
          </div>
        </div>
      </div>
      <ScrollArea
        type="always"
        viewportRef={viewportRef}
        className="max-h-[360px] md:max-h-[calc(360px-3rem)] [&_[data-radix-scroll-area-viewport]]:max-h-[inherit]"
      >
        <div className="w-full pr-3 md:min-w-[860px]">
          {versions.map((version, index) => (
            <SecretVersionRow
              key={version.version_no}
              projectId={projectId}
              secretId={secretId}
              secretName={secretName}
              version={version}
              isLastRow={index === versions.length - 1}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}

export function listPreviousVersions(
  secret: { current_version_no?: number; versions?: SecretVersionResponse[] } | undefined,
): SecretVersionResponse[] {
  const current = secret?.current_version_no
  return [...(secret?.versions ?? [])]
    .filter((version) => version.version_no !== current)
    .sort((left, right) => right.version_no - left.version_no)
}

export function SecretVersions({
  projectId,
  secretId,
  secretName,
  versions,
  errorMessage,
}: {
  projectId: string
  secretId: string
  secretName: string
  versions: SecretVersionResponse[]
  errorMessage: string | null
}) {
  return (
    <div className="px-6 pb-2 pt-6">
      {errorMessage ? (
        <p className="pb-4 text-sm text-destructive">{errorMessage}</p>
      ) : (
        <SecretVersionTable
          projectId={projectId}
          secretId={secretId}
          secretName={secretName}
          versions={versions}
        />
      )}
    </div>
  )
}
