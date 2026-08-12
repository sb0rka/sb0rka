import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Plus, Copy } from "lucide-react"
import { Button, buttonPressClass } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AlphaToast } from "@/components/ui/alpha-toast"
import { FloatingHint } from "@/components/ui/floating-hint"
import { Card, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useProjects, useDatabases } from "./hooks"
import type { ProjectResponse } from "./api"
import { CreateProjectDialog } from "./create-project-dialog"
import { PageStagger, SlideIn, StaggerGroup } from "@/components/motion/page-entrance"
import { MobileProjectCard } from "./components/mobile-project-card"
import { EmailVerificationDialog } from "./email-verification-dialog"
import { initializeAccount, verifyEmailCheck } from "../auth/api"
import { useAuth } from "../auth/auth-provider"

const ALPHA_UNDERSTOOD_KEY = "alpha-understood"

function ProjectCard({ project }: { project: ProjectResponse }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const { data, isLoading, isError } = useDatabases(project.id)
  const databases = data?.databases ?? []

  async function handleCopyProjectId() {
    try {
      await navigator.clipboard.writeText(project.id)
      setCopyMessage(t("projects.detail.idCopied"))
      window.setTimeout(() => setCopyMessage(null), 2000)
    } catch {
      setCopyMessage(t("common.messages.copyFailed"))
      window.setTimeout(() => setCopyMessage(null), 3000)
    }
  }

  return (
    <Card className="flex h-full flex-col shadow-sm">
      <CardHeader className="flex flex-1 flex-col gap-3 px-6 pb-4 pt-6">
        <div className="flex w-full items-center gap-3">
          <CardTitle className="min-w-0 flex-1 truncate text-xl font-semibold leading-normal tracking-[-0.3px]">
            {project.name}
          </CardTitle>
          <Badge
            variant={project.is_active ? "active" : "inactive"}
            className="shrink-0 px-2.5 py-0.5 text-xs font-semibold leading-4"
          >
            {project.is_active ? t("projects.cardOnline") : t("projects.cardOffline")}
          </Badge>
        </div>
        <div className="text-sm leading-5 text-muted-foreground">
          {isLoading ? (
            <p className="leading-5">{t("common.loading")}</p>
          ) : isError ? (
            <p className="leading-5">{t("common.notAvailable")}</p>
          ) : databases.length === 0 ? (
            <p className="leading-5">{t("databases.empty")}</p>
          ) : (
            <ul className="max-h-32 space-y-0 overflow-y-auto">
              {databases.map((db) => (
                <li key={db.resource_id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full truncate rounded-md py-0 text-left font-normal leading-5 text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      buttonPressClass,
                    )}
                    onClick={() =>
                      navigate(`/projects/${project.id}/databases/${db.resource_id}`)
                    }
                  >
                    {db.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardHeader>
      <CardFooter className="mt-auto flex flex-row flex-wrap items-center gap-6 px-6 pb-6 pt-0">
        <div className="relative min-w-0 flex-1 basis-[min-content]">
          <button
            type="button"
            onClick={() => void handleCopyProjectId()}
            className={cn(
              "flex w-full min-w-0 items-center gap-2",
              buttonPressClass,
            )}
            aria-label={t("projects.detail.copyProjectId")}
          >
            <Copy className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-left text-sm leading-5 text-muted-foreground">
              {project.id}
            </span>
          </button>
          <FloatingHint message={copyMessage} placement="bottom" align="start" />
        </div>
        <Button className="shrink-0" onClick={() => navigate(`/projects/${project.id}`)}>
          {t("projects.cardConnect")}
        </Button>
      </CardFooter>
    </Card>
  )
}

export function ProjectsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [createOpen, setCreateOpen] = useState(false)
  const [emailVerifiedOpen, setEmailVerifiedOpen] = useState(false)
  const [alphaToastOpen, setAlphaToastOpen] = useState(false)
  const { data, isLoading } = useProjects()
  const projects = data?.projects ?? []

  async function handleEmailVerified() {
    try {
      await initializeAccount()
      setEmailVerifiedOpen(false)
    } catch (err) {
      console.error("Account initialization failed", err)
    }
  }

  useEffect(() => {
    try {
      setAlphaToastOpen(!localStorage.getItem(ALPHA_UNDERSTOOD_KEY))
    } catch {
      setAlphaToastOpen(true)
    }
  }, [])

  useEffect(() => {
    async function checkEmailVerification() {
      try {
        const { verified } = await verifyEmailCheck()
        setEmailVerifiedOpen(!verified)
      } catch (err) {
        console.error("Failed to check email verification status", err)
        setEmailVerifiedOpen(false)
      }
    }

    checkEmailVerification()
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center min-h-[500px]">
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </div>
      ) : (
        <PageStagger className="flex min-h-0 flex-1 flex-col gap-4 md:gap-4">
          <SlideIn className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold text-foreground">{t("projects.title")}</h1>
            <Button
              size="icon"
              className="size-9 shrink-0 rounded-xl md:h-9 md:w-auto md:rounded-md md:px-4"
              onClick={() => setCreateOpen(true)}
              aria-label={t("projects.create")}
            >
              <Plus className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">{t("projects.create")}</span>
            </Button>
          </SlideIn>

          {projects.length === 0 ? (
            <SlideIn className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-border shadow-sm">
              <div className="flex flex-col items-center gap-1">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">
                  {t("projects.emptyTitle")}
                </h2>
                <p className="text-sm tracking-tight text-muted-foreground">
                  {t("projects.emptyDescription")}
                </p>
                <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("projects.create")}
                </Button>
              </div>
            </SlideIn>
          ) : (
            <>
              <StaggerGroup className="grid gap-3 md:hidden">
                {projects.map((project) => (
                  <SlideIn key={project.id}>
                    <MobileProjectCard project={project} />
                  </SlideIn>
                ))}
              </StaggerGroup>
              <StaggerGroup className="hidden gap-4 [grid-template-columns:repeat(auto-fill,minmax(0,450px))] md:grid [&>*]:h-full">
                {projects.map((project) => (
                  <SlideIn key={project.id} className="h-full max-w-[450px]">
                    <ProjectCard project={project} />
                  </SlideIn>
                ))}
              </StaggerGroup>
            </>
          )}
        </PageStagger>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
      {user && (
        <EmailVerificationDialog
          open={emailVerifiedOpen}
          userId={user.id}
          onVerified={handleEmailVerified}
        />
      )}

      {alphaToastOpen ? (
        <div
          className="fixed inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-50 md:inset-x-auto md:bottom-[10px] md:right-[10px] md:max-w-[400px]"
          aria-live="polite"
        >
          <AlphaToast
            className="w-full"
            title={t("app.alphaToastTitle")}
            description={t("app.alphaToastDescription")}
            actionLabel={t("app.alphaToastAction")}
            onAction={() => {
              try {
                localStorage.setItem(ALPHA_UNDERSTOOD_KEY, "1")
              } catch {
                /* ignore quota / private mode */
              }
              setAlphaToastOpen(false)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
