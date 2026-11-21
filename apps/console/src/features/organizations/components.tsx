import { useId, useState, type FormEvent, type ReactNode } from "react"
import { Check, ChevronDown, Ellipsis } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  Button,
  CardFooter,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Textarea,
  cn,
} from "@sb0rka/ui"
import {
  assignableOrganizationRoles,
  type AssignableOrganizationRole,
  type OrganizationFields,
} from "./api"

export function OrganizationStatus({
  children,
  action,
  loading,
  error,
}: {
  children?: ReactNode
  action?: ReactNode
  loading?: boolean
  error?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-40 flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm text-muted-foreground" role={error ? "alert" : "status"}>
        {loading ? t("common.loading") : children}
      </p>
      {action}
    </div>
  )
}

export function OrganizationLoadError({
  retry,
  unavailable = false,
}: {
  retry: () => void
  unavailable?: boolean
}) {
  const { t } = useTranslation()
  return (
    <OrganizationStatus
      error
      action={
        <Button type="button" variant="outline" onClick={retry}>
          {t("organizations.retry")}
        </Button>
      }
    >
      {t(unavailable ? "organizations.errors.unavailable" : "organizations.errors.load")}
    </OrganizationStatus>
  )
}

interface OptionMenuProps<T extends string> {
  id?: string
  label: string
  value: T | ""
  options: { value: T; label: string; disabled?: boolean }[]
  placeholder?: string
  disabled?: boolean
  onChange: (value: T) => void
}

export function OptionMenu<T extends string>({
  id,
  label,
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: OptionMenuProps<T>) {
  const selected = options.find((option) => option.value === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn(
            "justify-between gap-3 font-normal active:!transform-none",
            id && "w-full",
          )}
          aria-label={`${label}: ${selected?.label ?? placeholder}`}
          disabled={disabled}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[var(--radix-dropdown-menu-trigger-width)] max-w-[var(--radix-dropdown-menu-content-available-width)] overflow-y-auto !animate-none [&_[role]:active]:!transform-none"
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            role="menuitemradio"
            aria-checked={option.value === value}
            disabled={option.disabled}
            className="justify-between gap-3"
            onSelect={() => onChange(option.value)}
          >
            <span className="[overflow-wrap:anywhere]">{option.label}</span>
            {option.value === value && <Check className="size-4" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function OrganizationRoleMenu({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string
  value: AssignableOrganizationRole | ""
  onChange: (role: AssignableOrganizationRole) => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  return (
    <OptionMenu<AssignableOrganizationRole>
      id={id}
      value={value}
      label={t("organizations.members.role")}
      placeholder={t("organizations.members.chooseRole")}
      disabled={disabled}
      onChange={onChange}
      options={assignableOrganizationRoles.map((role) => ({
        value: role,
        label: t("organizations.roles." + role),
      }))}
    />
  )
}

export function OrganizationFieldsForm({
  initialFields,
  submitLabel,
  busy,
  requireChange,
  onSave,
  cancel,
}: {
  initialFields: OrganizationFields
  submitLabel: string
  busy: boolean
  requireChange?: boolean
  onSave: (fields: OrganizationFields) => Promise<boolean>
  cancel?: () => void
}) {
  const { t } = useTranslation()
  const nameId = useId()
  const descriptionId = useId()
  const [draft, setDraft] = useState<OrganizationFields>()
  const fields = draft ?? initialFields
  const name = fields.name.trim()
  const description = fields.description.trim()
  const unchanged = name === initialFields.name && description === initialFields.description
  const canSubmit = Boolean(name) && (!requireChange || !unchanged) && !busy

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (canSubmit) {
      void onSave({ name, description }).then((saved) => {
        if (saved) setDraft(undefined)
      })
    }
  }

  return (
    <form onSubmit={submit} autoComplete="off">
      <div
        className={cn("flex flex-col gap-4 px-6 pb-6", !cancel && "border-b border-border")}
      >
        <div className="space-y-1.5">
          <Label htmlFor={nameId}>{t("common.labels.name")}</Label>
          <Input
            id={nameId}
            value={fields.name}
            onChange={(event) => setDraft({ ...fields, name: event.target.value })}
            disabled={busy}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={descriptionId}>{t("common.labels.description")}</Label>
          <Textarea
            id={descriptionId}
            rows={3}
            value={fields.description}
            onChange={(event) => setDraft({ ...fields, description: event.target.value })}
            disabled={busy}
          />
        </div>
      </div>
      {cancel ? (
        <DialogFooter className="min-h-16 items-center pb-6 pt-0 sm:justify-between">
          <Button type="button" variant="outline" disabled={busy} onClick={cancel}>
            {t("common.actions.cancel")}
          </Button>
          <Button type="submit" disabled={!canSubmit} aria-busy={busy}>
            {submitLabel}
          </Button>
        </DialogFooter>
      ) : (
        <CardFooter className="items-start pt-6">
          <Button type="submit" disabled={!canSubmit} aria-busy={busy}>
            {submitLabel}
          </Button>
        </CardFooter>
      )}
    </form>
  )
}

export function OrganizationActionMenu({
  label,
  disabled,
  children,
}: {
  label: string
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="active:!transform-none"
          size="icon"
          aria-label={label}
          disabled={disabled}
        >
          <Ellipsis className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="!animate-none [&_[role]:active]:!transform-none"
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
