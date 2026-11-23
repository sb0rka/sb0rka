import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Building } from "lucide-react"
import { Badge, buttonPressClass, cn } from "@sb0rka/ui"
import { useProjects, useDatabases } from "./hooks"
import type { ProjectResponse } from "./api"
import { CreateProjectDialog } from "./create-project-dialog"
import { ResourceList } from "@/components/resource-list"
import { ResourceCard } from "@/components/resource-card"
import { useAuth } from "../auth/auth-provider"
import { useOrganizations } from "../organizations/hooks"

function ProjectCard({
  project,
  organizationName,
}: {
  project: ProjectResponse
  organizationName?: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data, isLoading, isError } = useDatabases(project.public_id)
  const databases = data?.dbis ?? []

  return (
    <ResourceCard
      id={project.public_id}
      name={project.name}
      href={`/projects/${project.public_id}`}
      openLabel={t("projects.cardConnect")}
      copyLabel={t("projects.detail.copyProjectId")}
      mark={organizationName ? (
        <span title={organizationName} aria-label={organizationName} className="inline-flex">
          <Building className="size-4" aria-hidden />
        </span>
      ) : undefined}
      badge={
        <Badge
          variant={project.is_active ? "active" : "inactive"}
          className="shrink-0 px-2.5 py-0.5 text-xs font-semibold leading-4"
        >
          {project.is_active ? t("projects.cardOnline") : t("projects.cardOffline")}
        </Badge>
      }
    >
      <div className="hidden text-sm leading-5 text-muted-foreground md:block">
        {isLoading ? (
          <p className="leading-5">{t("common.loading")}</p>
        ) : isError ? (
          <p className="leading-5">{t("common.notAvailable")}</p>
        ) : databases.length === 0 ? (
          <p className="leading-5">{t("databases.empty")}</p>
        ) : (
          <ul className="max-h-32 space-y-0 overflow-y-auto">
            {databases.map((db) => (
              <li key={db.public_id}>
                <button
                  type="button"
                  className={cn(
                    "w-full truncate rounded-md py-0 text-left font-normal leading-5 text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    buttonPressClass,
                  )}
                  onClick={() =>
                    navigate(`/projects/${project.public_id}/databases/${db.public_id}`)
                  }
                >
                  {db.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ResourceCard>
  )
}

export function ProjectsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [createOpen, setCreateOpen] = useState(false)
  const { data, isLoading } = useProjects()
  const projects = data?.projects ?? []
  const organizations = useOrganizations(
    projects.some((project) => project.owner_subject_id && project.owner_subject_id !== user?.id),
  )
  const organizationNames = new Map(
    organizations.data?.organizations.map((org) => [org.id, org.name]),
  )

  return (
    <>
      {isLoading ? (
        <div className="flex min-h-[500px] flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </div>
      ) : (
        <ResourceList
          title={t("projects.title")}
          createLabel={t("projects.create")}
          onCreate={() => setCreateOpen(true)}
          emptyTitle={t("projects.emptyTitle")}
          emptyDescription={t("projects.emptyDescription")}
        >
          {projects.map((project) => (
            <ProjectCard
              key={project.public_id}
              project={project}
              organizationName={organizationNames.get(project.owner_subject_id) ?? (
                isOrganizationProject(project) ? t("organizations.fallbackName") : undefined
              )}
            />
          ))}
        </ResourceList>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}

function isOrganizationProject(project: ProjectResponse) {
  // The API bills personal projects to their owner and organization projects to the owner's user account.
  return Boolean(
    project.owner_subject_id &&
    project.billing_subject_id &&
    project.owner_subject_id !== project.billing_subject_id,
  )
}
