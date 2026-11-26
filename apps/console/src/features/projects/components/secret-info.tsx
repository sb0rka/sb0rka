import { Pencil, RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button, Textarea, cn } from "@sb0rka/ui"
import { formatDateTime } from "@/lib/format-date"
import type { SecretResponse } from "../api"

interface SecretInfoProps {
  secret: SecretResponse | undefined
  description: string
  onDescriptionChange: (value: string) => void
  descriptionFocused: boolean
  onDescriptionFocusedChange: (focused: boolean) => void
  descriptionChanged: boolean
  savePending: boolean
  onSave: () => void
  refreshPending: boolean
  onRefresh: () => void
  currentVersion?: number
}

export function SecretInfo({
  secret,
  description,
  onDescriptionChange,
  descriptionFocused,
  onDescriptionFocusedChange,
  descriptionChanged,
  savePending,
  onSave,
  refreshPending,
  onRefresh,
  currentVersion,
}: SecretInfoProps) {
  const { t } = useTranslation()
  const creatorId = secret?.created_by_subject_id
  const creatorKind = secret?.created_by_subject_kind
  const creatorTitle = creatorId ? `${creatorKind ? `${creatorKind} ` : ""}${creatorId}` : "—"
  const creatorLabel = creatorId ? `${creatorKind ? `${creatorKind} ` : ""}${creatorId.slice(0, 12)}...` : "—"

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 px-4 py-4 md:grid-cols-2 sm:gap-x-6 sm:p-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,0.6fr)_minmax(0,0.9fr)_minmax(0,0.8fr)] lg:gap-x-6">
      <div className="col-start-1 row-start-1 row-span-2 flex h-full min-h-0 min-w-0 flex-col gap-1.5">
        <p className="text-sm font-medium text-foreground">{t("secrets.secretDescription")}</p>
        <Textarea
          rows={1}
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          onFocus={() => onDescriptionFocusedChange(true)}
          onBlur={() => onDescriptionFocusedChange(false)}
          placeholder={descriptionFocused ? undefined : t("common.notAvailable")}
          title={description.trim() || undefined}
          aria-label={t("secrets.secretDescription")}
          className="min-h-0 flex-1 resize-none overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-sm leading-5 text-muted-foreground md:text-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        />
      </div>
      <InfoField label={t("secrets.payloadKind")} value={secret?.payload_kind || "—"} />
      <InfoField label={t("secrets.createdBy")} value={creatorLabel} title={creatorTitle} />
      <InfoField label={t("common.labels.createdAt")} value={formatDateTime(secret?.created_at)} />
      <div className="flex min-w-0 items-center gap-2 self-end">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          disabled={!descriptionChanged || savePending}
          onClick={onSave}
          title={t("secrets.updateDescription")}
          aria-label={t("secrets.updateDescription")}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          disabled={refreshPending}
          onClick={onRefresh}
          title={t("secrets.refresh")}
          aria-label={t("secrets.refresh")}
        >
          <RefreshCw className={cn("h-4 w-4", refreshPending && "animate-spin")} aria-hidden />
        </Button>
      </div>
      <InfoField
        label={t("secrets.scheduledDestroyAt")}
        value={formatDateTime(secret?.scheduled_destroy_at)}
      />
      <InfoField label={t("common.labels.updatedAt")} value={formatDateTime(secret?.updated_at)} />
      {currentVersion ? (
        <InfoField label={t("secrets.currentVersion")} value={String(currentVersion)} />
      ) : null}
    </div>
  )
}

function InfoField({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="truncate text-sm font-medium text-foreground">{label}</p>
      <p className="truncate text-sm leading-5 text-muted-foreground" title={title ?? value}>
        {value}
      </p>
    </div>
  )
}
