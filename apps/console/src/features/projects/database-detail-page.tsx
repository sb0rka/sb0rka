import { useEffect, useMemo, useState } from "react"
import { Copy } from "lucide-react"
import { useNavigate, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { ApiError } from "@/lib/api-client"
import { FloatingHint } from "@/components/ui/floating-hint"
import { getResolvedLanguage } from "@/lib/i18n"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useConfirmDialog } from "@/components/confirm-dialog-provider"
import { useToast } from "@/components/toast-provider"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AddTagDialog } from "./components/add-tag-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  useDatabase,
  useDatabaseUri,
  useDeactivateResource,
  useResources,
  useResourceTags,
  useAttachResourceTag,
  useUpdateDatabase,
} from "./hooks"
import { formatDraftTagLabel } from "./parse-draft-tag"

/** Same masking length as the secret value field on `SecretDetails`. */
const SENSITIVE_MASK = "•••••••••••••••••••••••"

function parsePostgresUri(uri: string): {
  hostname: string
  port: string
  username: string
  password: string
  database: string
} | null {
  try {
    const normalized = uri.trim().replace(/^postgres(ql)?:/i, "http:")
    const u = new URL(normalized)
    const username = decodeURIComponent(u.username || "")
    const password = decodeURIComponent(u.password || "")
    const hostname = u.hostname
    const port = u.port || "5432"
    const pathDb = u.pathname.replace(/^\//, "")
    const database = decodeURIComponent(pathDb.split("/")[0] || "")
    if (!hostname) return null
    return { hostname, port, username, password, database }
  } catch {
    return null
  }
}

function maskPostgresUri(parsed: {
  hostname: string
  port: string
  database: string
}): string {
  return `postgresql://****:****@${parsed.hostname}:${parsed.port}/${parsed.database}`
}

function formatDateOnly(value: string | undefined, locale: string): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date)
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

type CopyHintAnchor =
  | "hostname"
  | "port"
  | "connectionDb"
  | "user"
  | "password"
  | "uri"

type ConnectionCopyFieldProps = {
  label: string
  displayText: string
  copyText: string | undefined
  disabled?: boolean
  copyAriaLabel: string
  onCopy: () => void
  hintMessage: string | null
  hintAnchor: CopyHintAnchor
  activeHintAnchor: CopyHintAnchor | null
}

function ConnectionCopyField({
  label,
  displayText,
  copyText,
  disabled,
  copyAriaLabel,
  onCopy,
  hintMessage,
  hintAnchor,
  activeHintAnchor,
}: ConnectionCopyFieldProps) {
  const canCopy = Boolean(copyText && !disabled)

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      <div className="relative">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 rounded-md bg-muted px-3 py-2">
            <p className="truncate font-mono text-base text-muted-foreground">{displayText}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!canCopy}
              title={copyAriaLabel}
              aria-label={copyAriaLabel}
              onClick={onCopy}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <FloatingHint
          message={activeHintAnchor === hintAnchor ? hintMessage : null}
          placement="bottom"
          align="end"
        />
      </div>
    </div>
  )
}

type SensitiveConnectionFieldProps = {
  label: string
  displayedValue: string
  isVisible: boolean
  onToggle: () => void
  onCopy: () => void
  copyDisabled: boolean
  toggleDisabled: boolean
  copyAriaLabel: string
  toggleLabelShow: string
  toggleLabelHide: string
  hintMessage: string | null
  hintAnchor: CopyHintAnchor
  activeHintAnchor: CopyHintAnchor | null
}

function SensitiveConnectionField({
  label,
  displayedValue,
  isVisible,
  onToggle,
  onCopy,
  copyDisabled,
  toggleDisabled,
  copyAriaLabel,
  toggleLabelShow,
  toggleLabelHide,
  hintMessage,
  hintAnchor,
  activeHintAnchor,
}: SensitiveConnectionFieldProps) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      <div className="relative">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 rounded-md bg-secondary px-3.5 py-2.5">
            <p className="truncate font-mono text-xs font-semibold text-muted-foreground">
              {displayedValue}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onCopy}
              disabled={copyDisabled}
              title={copyAriaLabel}
              aria-label={copyAriaLabel}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-w-[70.25px]"
              onClick={onToggle}
              disabled={toggleDisabled}
            >
              {isVisible ? toggleLabelHide : toggleLabelShow}
            </Button>
          </div>
        </div>
        <FloatingHint
          message={activeHintAnchor === hintAnchor ? hintMessage : null}
          placement="bottom"
          align="end"
        />
      </div>
    </div>
  )
}

export function DatabaseDetailPage() {
  const { t } = useTranslation()
  const locale = getResolvedLanguage()
  const confirm = useConfirmDialog()
  const { showSuccess } = useToast()
  const { id = "", resourceId = "" } = useParams<{
    id: string
    resourceId: string
  }>()
  const navigate = useNavigate()
  const normalizedResourceId = resourceId.trim()
  const isValidResourceId = normalizedResourceId.length > 0

  const databaseQuery = useDatabase(id, isValidResourceId ? normalizedResourceId : undefined)
  const resourcesQuery = useResources(id)
  const tagsQuery = useResourceTags(id, isValidResourceId ? normalizedResourceId : undefined)
  const updateDatabase = useUpdateDatabase(
    id,
    isValidResourceId ? normalizedResourceId : undefined,
  )
  const attachResourceTag = useAttachResourceTag(id)
  const deactivateResource = useDeactivateResource(
    id,
    isValidResourceId ? normalizedResourceId : undefined,
  )

  const databaseUri = useDatabaseUri(
    id,
    isValidResourceId ? normalizedResourceId : undefined,
    isValidResourceId,
  )

  const resourceTimestamps = useMemo(() => {
    const row = resourcesQuery.data?.resources.find((r) => r.id === normalizedResourceId)
    return row ? { createdAt: row.created_at, updatedAt: row.updated_at } : null
  }, [resourcesQuery.data?.resources, normalizedResourceId])

  const parsedUri = useMemo(
    () => (databaseUri.data ? parsePostgresUri(databaseUri.data) : null),
    [databaseUri.data],
  )

  const maskedUriDisplay = useMemo(() => {
    if (parsedUri) return maskPostgresUri(parsedUri)
    if (databaseUri.data) return "postgresql://****:****@…"
    return "—"
  }, [parsedUri, databaseUri.data])

  const [description, setDescription] = useState("")
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)
  const [tagActionSuccess, setTagActionSuccess] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [copyHint, setCopyHint] = useState<string | null>(null)
  const [copyHintAnchor, setCopyHintAnchor] = useState<CopyHintAnchor | null>(null)
  const [isUserVisible, setIsUserVisible] = useState(false)
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isUriVisible, setIsUriVisible] = useState(false)

  useEffect(() => {
    setDescription(databaseQuery.data?.description ?? "")
  }, [databaseQuery.data?.description])

  useEffect(() => {
    setIsUserVisible(false)
    setIsPasswordVisible(false)
    setIsUriVisible(false)
    setCopyHint(null)
    setCopyHintAnchor(null)
    setIsTagModalOpen(false)
    setTagActionSuccess(null)
  }, [normalizedResourceId])

  const hasDescriptionChange =
    description.trim() !== (databaseQuery.data?.description ?? "").trim()

  async function copyWithHint(text: string, anchor: CopyHintAnchor) {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopyHint(t("common.messages.copied"))
      setCopyHintAnchor(anchor)
      window.setTimeout(() => {
        setCopyHint(null)
        setCopyHintAnchor(null)
      }, 2000)
    } catch {
      setCopyHint(t("common.messages.copyFailed"))
      setCopyHintAnchor(anchor)
      window.setTimeout(() => {
        setCopyHint(null)
        setCopyHintAnchor(null)
      }, 3000)
    }
  }

  function handleToggleUserVisible() {
    if (isUserVisible) {
      setIsUserVisible(false)
      setCopyHint(null)
      setCopyHintAnchor(null)
      return
    }
    setIsUserVisible(true)
  }

  function handleTogglePasswordVisible() {
    if (isPasswordVisible) {
      setIsPasswordVisible(false)
      setCopyHint(null)
      setCopyHintAnchor(null)
      return
    }
    setIsPasswordVisible(true)
  }

  function handleToggleUriVisible() {
    if (isUriVisible) {
      setIsUriVisible(false)
      setCopyHint(null)
      setCopyHintAnchor(null)
      return
    }
    setIsUriVisible(true)
  }

  async function handleSave() {
    if (!hasDescriptionChange || updateDatabase.isPending) return

    setSaveError(null)
    setSaveSuccess(null)
    try {
      await updateDatabase.mutateAsync({
        description,
      })
      setSaveSuccess(t("common.messages.changesSaved"))
    } catch (error) {
      setSaveError(getErrorMessage(error, t("profile.emailSaveError")))
    }
  }

  async function handleDeactivate() {
    if (deactivateResource.isPending) return

    const confirmed = await confirm({
      title: t("databases.deleteTitle"),
      description: t("databases.deleteDescription"),
      confirmText: t("common.actions.delete"),
      cancelText: t("common.actions.cancel"),
      confirmVariant: "destructive",
    })
    if (!confirmed) return

    setDeleteError(null)
    try {
      await deactivateResource.mutateAsync()
      showSuccess(t("databases.deleted"))
      navigate(`/projects/${id}?tab=databases`)
    } catch (error) {
      setDeleteError(
        getErrorMessage(error, t("databases.deleteError")),
      )
    }
  }

  const uriBusy = databaseUri.isFetching
  const hasUri = Boolean(databaseUri.data)
  const parsedUriReady = Boolean(parsedUri)
  const parsedFieldsBusy = uriBusy

  const displayedUsername = !parsedUriReady
    ? parsedFieldsBusy
      ? "…"
      : "—"
    : isUserVisible
      ? parsedUri!.username || "—"
      : SENSITIVE_MASK

  const displayedPassword = !parsedUriReady
    ? parsedFieldsBusy
      ? "…"
      : "—"
    : isPasswordVisible
      ? parsedUri!.password || "—"
      : SENSITIVE_MASK

  const displayedFullUri =
    !hasUri ? (uriBusy ? "…" : "—") : isUriVisible && databaseUri.data
      ? databaseUri.data
      : maskedUriDisplay

  const toggleFieldsDisabled = parsedFieldsBusy || databaseUri.isError
  const uriCopyDisabled = !hasUri || uriBusy

  if (!isValidResourceId) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-destructive">{t("databases.invalidId")}</p>
        <div>
          <Button variant="outline" onClick={() => navigate(`/projects/${id}?tab=databases`)}>
            {t("databases.backToList")}
          </Button>
        </div>
      </div>
    )
  }

  if (databaseQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("databases.loading")}</p>
  }

  if (databaseQuery.isError || !databaseQuery.data) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-destructive">
          {getErrorMessage(databaseQuery.error, t("databases.loadError"))}
        </p>
        <div>
          <Button variant="outline" onClick={() => navigate(`/projects/${id}?tab=databases`)}>
            {t("databases.backToList")}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {databaseQuery.data.name}
          </h1>
          <Badge variant="active">{t("databases.online")}</Badge>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {tagsQuery.data?.tags.map((tag) => (
              <Badge key={tag.id}>{formatDraftTagLabel(tag)}</Badge>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-2.5 text-xs font-semibold"
              onClick={() => {
                setTagActionSuccess(null)
                setIsTagModalOpen(true)
              }}
            >
              {t("databases.addTag")}
            </Button>
          </div>
        </div>
        {tagActionSuccess ? (
          <p className="text-sm text-emerald-600">{tagActionSuccess}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-6">
        <Card className="overflow-hidden shadow-sm">
          <CardContent className="grid gap-6 px-6 py-6 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-foreground">{t("common.labels.createdAt")}</p>
              <p className="text-base text-muted-foreground">
                {formatDateOnly(resourceTimestamps?.createdAt, locale)}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-foreground">{t("common.labels.updatedAt")}</p>
              <p className="text-base text-muted-foreground">
                {formatDateOnly(resourceTimestamps?.updatedAt, locale)}
              </p>
            </div>
          </CardContent>
          <div className="border-t border-border px-6 pb-6">
            <div className="flex flex-col gap-1.5 pt-6">
              <Label htmlFor="database-description">{t("common.labels.description")}</Label>
              <Input
                id="database-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("databases.descriptionPlaceholder")}
              />
            </div>
          </div>
          <CardFooter className="border-t border-border px-6 py-6">
            <div className="flex flex-col gap-2">
              <Button
                className="self-start"
                onClick={handleSave}
                disabled={!hasDescriptionChange || updateDatabase.isPending}
              >
                {updateDatabase.isPending ? t("common.saving") : t("common.actions.saveChanges")}
              </Button>
              {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
              {saveSuccess ? <p className="text-sm text-emerald-600">{saveSuccess}</p> : null}
            </div>
          </CardFooter>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="gap-1.5 border-b border-border pb-6">
            <CardTitle className="text-xl font-semibold tracking-tight text-card-foreground">
              {t("databases.accessTitle")}
            </CardTitle>
            <CardDescription>{t("databases.accessDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 border-b border-border px-6 py-6">
            <div className="flex flex-col gap-4 md:flex-row">
              <ConnectionCopyField
                label={t("databases.hostname")}
                displayText={
                  parsedUriReady ? parsedUri!.hostname : parsedFieldsBusy ? "…" : "—"
                }
                copyText={parsedUri?.hostname}
                disabled={toggleFieldsDisabled || !parsedUriReady}
                copyAriaLabel={`${t("databases.copyField")}: ${t("databases.hostname")}`}
                onCopy={() =>
                  parsedUri && void copyWithHint(parsedUri.hostname, "hostname")
                }
                hintMessage={copyHint}
                hintAnchor="hostname"
                activeHintAnchor={copyHintAnchor}
              />
              <ConnectionCopyField
                label={t("databases.port")}
                displayText={
                  parsedUriReady ? parsedUri!.port : parsedFieldsBusy ? "…" : "—"
                }
                copyText={parsedUri?.port}
                disabled={toggleFieldsDisabled || !parsedUriReady}
                copyAriaLabel={`${t("databases.copyField")}: ${t("databases.port")}`}
                onCopy={() =>
                  parsedUri && void copyWithHint(parsedUri.port, "port")
                }
                hintMessage={copyHint}
                hintAnchor="port"
                activeHintAnchor={copyHintAnchor}
              />
            </div>
            <div className="flex flex-col gap-4 md:flex-row">
              <SensitiveConnectionField
                label={t("databases.username")}
                displayedValue={displayedUsername}
                isVisible={isUserVisible}
                onToggle={handleToggleUserVisible}
                onCopy={() =>
                  parsedUri && void copyWithHint(parsedUri.username, "user")
                }
                copyDisabled={toggleFieldsDisabled || !parsedUriReady}
                toggleDisabled={toggleFieldsDisabled || !parsedUriReady}
                copyAriaLabel={`${t("databases.copyField")}: ${t("databases.username")}`}
                toggleLabelShow={t("common.actions.show")}
                toggleLabelHide={t("common.actions.hide")}
                hintMessage={copyHint}
                hintAnchor="user"
                activeHintAnchor={copyHintAnchor}
              />
              <SensitiveConnectionField
                label={t("databases.password")}
                displayedValue={displayedPassword}
                isVisible={isPasswordVisible}
                onToggle={handleTogglePasswordVisible}
                onCopy={() =>
                  parsedUri &&
                  void copyWithHint(parsedUri.password, "password")
                }
                copyDisabled={toggleFieldsDisabled || !parsedUriReady}
                toggleDisabled={toggleFieldsDisabled || !parsedUriReady}
                copyAriaLabel={`${t("databases.copyField")}: ${t("databases.password")}`}
                toggleLabelShow={t("common.actions.show")}
                toggleLabelHide={t("common.actions.hide")}
                hintMessage={copyHint}
                hintAnchor="password"
                activeHintAnchor={copyHintAnchor}
              />
            </div>
            <div className="flex flex-col gap-4 md:flex-row">
              <ConnectionCopyField
                label={t("databases.connectionDb")}
                displayText={
                  parsedUriReady ? parsedUri!.database : parsedFieldsBusy ? "…" : "—"
                }
                copyText={parsedUri?.database}
                disabled={toggleFieldsDisabled || !parsedUriReady}
                copyAriaLabel={`${t("databases.copyField")}: ${t("databases.connectionDb")}`}
                onCopy={() =>
                  parsedUri && void copyWithHint(parsedUri.database, "connectionDb")
                }
                hintMessage={copyHint}
                hintAnchor="connectionDb"
                activeHintAnchor={copyHintAnchor}
              />
              <div className="hidden min-w-0 flex-1 md:block" aria-hidden />
            </div>
            {databaseUri.isError ? (
              <p className="text-sm text-destructive">
                {getErrorMessage(databaseUri.error, t("databases.uriError"))}
              </p>
            ) : null}
          </CardContent>
          <CardContent className="px-6 py-6">
            <div className="flex flex-col gap-1.5">
              <Label>{t("databases.fullUri")}</Label>
              <div className="relative">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1 rounded-md bg-secondary px-3.5 py-2.5">
                    <p className="truncate font-mono text-xs font-semibold text-muted-foreground">
                      {displayedFullUri}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={uriCopyDisabled}
                      title={t("databases.copyUri")}
                      aria-label={t("databases.copyUri")}
                      onClick={() =>
                        databaseUri.data &&
                        void copyWithHint(databaseUri.data, "uri")
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-w-[70.25px]"
                      onClick={handleToggleUriVisible}
                      disabled={uriCopyDisabled}
                    >
                      {isUriVisible ? t("common.actions.hide") : t("common.actions.show")}
                    </Button>
                  </div>
                </div>
                <FloatingHint
                  message={copyHintAnchor === "uri" ? copyHint : null}
                  placement="bottom"
                  align="end"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden shadow-sm">
          <CardHeader className="gap-1.5 border-b border-border pb-6">
            <CardTitle className="text-xl font-semibold tracking-tight text-card-foreground">
              {t("projects.settings.dangerTitle")}
            </CardTitle>
            <CardDescription>{t("databases.dangerDescription")}</CardDescription>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-2 px-6 py-6">
            <Button
              variant="ghost"
              className="h-auto w-[180px] justify-center px-4 py-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleDeactivate}
              disabled={deactivateResource.isPending}
            >
              {deactivateResource.isPending
                ? t("common.deleting")
                : t("databases.deleteButton")}
            </Button>
            {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
          </CardFooter>
        </Card>
      </div>

      <AddTagDialog
        open={isTagModalOpen}
        onOpenChange={setIsTagModalOpen}
        inputId={`database-draft-tag-${normalizedResourceId}`}
        isSubmitting={attachResourceTag.isPending}
        checkDuplicate={(parsed) =>
          tagsQuery.data?.tags.some(
            (tag) => tag.tag_key === parsed.tag_key && tag.tag_value === parsed.tag_value,
          )
            ? t("common.messages.tagDuplicate")
            : null
        }
        mapSubmitError={(err) => getErrorMessage(err, t("common.messages.tagAddError"))}
        onSubmit={async (parsed) => {
          if (!isValidResourceId) return false
          setTagActionSuccess(null)
          await attachResourceTag.mutateAsync({
            resourceId: normalizedResourceId,
            data: parsed,
          })
          setTagActionSuccess(t("common.messages.tagAdded"))
        }}
      />
    </div>
  )
}
