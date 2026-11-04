import { useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Building2, Copy, Plus } from "lucide-react"
import {
  Button,
  buttonPressClass,
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
  FloatingHint,
} from "@sb0rka/ui"
import { useProjects } from "@/features/projects/hooks"
import { PageStagger, SlideIn, StaggerGroup } from "@/components/motion/page-entrance"
import { CreateOrganizationDialog } from "./create-organization-dialog"
import { useOrganizations } from "./hooks"
import type { OrganizationResponse } from "./api"

function OrganizationCard({
  organization,
  projectCount,
}: {
  organization: OrganizationResponse
  projectCount: number
}) {
  const { t } = useTranslation()
  const [copyMessage, setCopyMessage] = useState<string | null>(null)

  async function handleCopyId() {
    try {
      await navigator.clipboard.writeText(organization.id)
      setCopyMessage(t("organizations.idCopied"))
      window.setTimeout(() => setCopyMessage(null), 2000)
    } catch {
      setCopyMessage(t("common.messages.copyFailed"))
      window.setTimeout(() => setCopyMessage(null), 3000)
    }
  }

  return (
    <Card className="flex h-full flex-col shadow-sm">
      <CardHeader className="flex flex-1 flex-col gap-3 px-6 pb-4 pt-6">
        <CardTitle className="min-w-0 truncate text-xl font-semibold leading-normal tracking-[-0.3px]">
          {organization.name}
        </CardTitle>
        <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">
          {organization.description || t("organizations.noDescription")}
        </p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="size-4 shrink-0" />
          <span>
            {t("organizations.summary", { projects: projectCount })}
          </span>
        </p>
      </CardHeader>
      <CardFooter className="mt-auto flex flex-row flex-wrap items-center gap-6 px-6 pb-6 pt-0">
        <div className="relative min-w-0 flex-1 basis-[min-content]">
          <button
            type="button"
            onClick={() => void handleCopyId()}
            className={cn("flex w-full min-w-0 items-center gap-2", buttonPressClass)}
            aria-label={t("organizations.copyId")}
          >
            <Copy className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-left text-sm leading-5 text-muted-foreground">
              {organization.id}
            </span>
          </button>
          <FloatingHint message={copyMessage} placement="bottom" align="start" />
        </div>
        <Button className="shrink-0" asChild>
          <Link to={`/organizations/${organization.id}`}>{t("common.actions.open")}</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

export function OrganizationsPage() {
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const organizationsQuery = useOrganizations()
  const projectsQuery = useProjects()
  const organizations = organizationsQuery.data?.organizations ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {organizationsQuery.isLoading ? (
        <div className="flex min-h-[500px] flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </div>
      ) : (
        <PageStagger className="flex min-h-0 flex-1 flex-col gap-4">
          <SlideIn className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">{t("organizations.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("organizations.subtitle")}</p>
            </div>
            <Button
              size="icon"
              className="size-9 shrink-0 rounded-xl md:h-9 md:w-auto md:rounded-md md:px-4"
              onClick={() => setCreateOpen(true)}
              aria-label={t("organizations.create")}
            >
              <Plus className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">{t("organizations.create")}</span>
            </Button>
          </SlideIn>

          {organizationsQuery.isError ? (
            <SlideIn>
              <p className="text-sm text-destructive">{t("organizations.loadError")}</p>
            </SlideIn>
          ) : organizations.length === 0 ? (
            <SlideIn className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-border shadow-sm">
              <div className="flex flex-col items-center gap-1 px-6 text-center">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">
                  {t("organizations.emptyTitle")}
                </h2>
                <p className="text-sm tracking-tight text-muted-foreground">
                  {t("organizations.emptyDescription")}
                </p>
                <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("organizations.create")}
                </Button>
              </div>
            </SlideIn>
          ) : (
            <StaggerGroup className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),450px))] [&>*]:h-full">
              {organizations.map((organization) => {
                const projectCount = (projectsQuery.data?.projects ?? []).filter(
                  (project) => project.owner_subject_id === organization.id,
                ).length
                return (
                  <SlideIn key={organization.id} className="h-full max-w-[450px]">
                    <OrganizationCard organization={organization} projectCount={projectCount} />
                  </SlideIn>
                )
              })}
            </StaggerGroup>
          )}
        </PageStagger>
      )}

      <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
