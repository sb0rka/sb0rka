import { useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Plus } from "lucide-react"
import { Button } from "@sb0rka/ui"
import { CreateProjectDialog } from "@/features/projects/create-project-dialog"
import { useProjects } from "@/features/projects/hooks"
import type { MemberRole } from "../roles"

interface OrgProjectsTabProps {
  organizationId: string
  callerRole: MemberRole | undefined
}

export function OrgProjectsTab({ organizationId, callerRole }: OrgProjectsTabProps) {
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const projectsQuery = useProjects()
  const projects = (projectsQuery.data?.projects ?? []).filter(
    (project) => project.owner_subject_id === organizationId,
  )
  const canCreate = callerRole === "owner"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("organizations.projects.description")}</p>
        {canCreate ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("projects.create")}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">{t("organizations.projects.ownerOnly")}</p>
        )}
      </div>

      {projectsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : projects.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">{t("organizations.projects.empty")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {projects.map((project) => (
            <li key={project.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                {project.description ? (
                  <p className="truncate text-sm text-muted-foreground">{project.description}</p>
                ) : null}
              </div>
              <Button variant="outline" asChild>
                <Link to={`/projects/${project.public_id || project.id}`}>
                  {t("common.actions.open")}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultOwnerSubjectId={organizationId}
      />
    </div>
  )
}
