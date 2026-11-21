import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  useToast,
} from "@sb0rka/ui"
import { ResourceCard } from "@/components/resource-card"
import { ResourceList } from "@/components/resource-list"
import { ApiError } from "@/lib/api-client"
import type { OrganizationFields, OrganizationListItem } from "./api"
import {
  OrganizationFieldsForm,
  OrganizationLoadError,
  OrganizationStatus,
} from "./components"
import { useCreateOrganization, useOrganization, useOrganizations } from "./hooks"
import { organizationRoute } from "./routes"
import { useOrganizationWrite } from "./use-organization-write"

function OrganizationCard({ organization }: { organization: OrganizationListItem }) {
  const { t } = useTranslation()
  // Older Auth APIs only include memberships in the detail response.
  const detail = useOrganization(organization.id, organization.member_count == null)
  const count = organization.member_count ?? detail.data?.members?.length

  return (
    <ResourceCard
      id={organization.id}
      name={organization.name}
      href={organizationRoute(organization.id)}
      openLabel={t("common.actions.open")}
      copyLabel={t("organizations.copyId")}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {count != null
          ? t("organizations.memberCount", { count })
          : t(detail.isPending ? "common.loading" : "common.notAvailable")}
      </p>
    </ResourceCard>
  )
}

export function OrganizationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showSuccess } = useToast()
  const organizations = useOrganizations()
  const create = useCreateOrganization()
  const { run, isWriting, verificationDialog } = useOrganizationWrite()
  const [createOpen, setCreateOpen] = useState(false)
  const unsupported =
    organizations.error instanceof ApiError && organizations.error.status === 404

  async function save(fields: OrganizationFields) {
    const result = await run(() => create.mutateAsync(fields))
    if (!result.ok) return false
    setCreateOpen(false)
    showSuccess(t("organizations.created"))
    navigate(organizationRoute(result.data.id))
    return true
  }

  if (organizations.isPending) return <OrganizationStatus loading />
  if (unsupported)
    return (
      <OrganizationStatus error>{t("organizations.errors.unsupported")}</OrganizationStatus>
    )
  if (organizations.isError)
    return <OrganizationLoadError retry={() => void organizations.refetch()} />

  return (
    <>
      <ResourceList
        wideCards
        title={t("nav.organizations")}
        createLabel={t("organizations.create")}
        onCreate={() => setCreateOpen(true)}
        emptyTitle={t("organizations.empty")}
        emptyDescription={t("organizations.emptyDescription")}
      >
        {organizations.data.organizations.map((organization) => (
          <OrganizationCard key={organization.id} organization={organization} />
        ))}
      </ResourceList>
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!isWriting) setCreateOpen(open)
        }}
      >
        <DialogContent className="gap-0 p-0 shadow-sm">
          <DialogHeader>
            <DialogTitle>{t("organizations.create")}</DialogTitle>
            <DialogDescription>{t("organizations.createDescription")}</DialogDescription>
          </DialogHeader>
          <OrganizationFieldsForm
            initialFields={{ name: "", description: "" }}
            busy={isWriting}
            submitLabel={t(isWriting ? "common.creating" : "common.actions.create")}
            cancel={() => setCreateOpen(false)}
            onSave={save}
          />
        </DialogContent>
      </Dialog>
      {verificationDialog}
    </>
  )
}
