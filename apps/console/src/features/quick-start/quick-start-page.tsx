import { useEffect, useState, type FormEvent } from "react"
import { Link, Navigate, useLocation, useNavigate, useNavigationType } from "react-router-dom"
import { Trans, useTranslation } from "react-i18next"
import { ArrowLeft, Home, KeyRound } from "lucide-react"
import { Button, Input, Label } from "@sb0rka/ui"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import { useAuth } from "@/features/auth/auth-provider"
import { useCreateProject, useProject, useProjects, useSecret } from "@/features/projects/hooks"
import { useCreateLlmKey } from "@/features/projects/use-create-llm-key"
import { hasCloudQuickStart, usePlatformInfo } from "@/features/system/info"
import { readProgress, saveProgress, useQuickStartProgress, type QuickStartProgress } from "./progress"
import { QuickStartResult } from "./quick-start-result"

const quickStartSecretName = "SB0RKA_LLM_KEY"

const readOnlyInputClass = "focus-visible:ring-0"

function ProjectStep({ userId, savedName }: { userId: string; savedName?: string }) {
  const { t } = useTranslation()
  const [name, setName] = useState(savedName ?? t("quickStart.defaultName"))
  const { data } = useProjects()
  const create = useCreateProject()
  const navigate = useNavigate()
  const project = data?.projects.find(p => p.is_active && p.owner_subject_id === userId && p.name === savedName)

  // The shared project list also recovers a creation whose response was lost.
  useEffect(() => {
    const progress = readProgress(userId)
    if (project && progress?.stage === "project" && progress.projectName === project.name) {
      saveProgress(userId, { stage: "key", projectId: project.public_id })
      navigate("?step=2")
    }
  }, [project, userId, navigate])

  function submit(event: FormEvent) {
    event.preventDefault()
    const requested = name.trim()
    if (!requested || create.isPending) return
    saveProgress(userId, { stage: "project", projectName: requested })
    create.mutate({ name: requested, description: "" })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="w-full space-y-1.5">
        <Label htmlFor="quick-project-name">{t("common.labels.name")}</Label>
        <Input id="quick-project-name" value={name} maxLength={31} required autoComplete="off"
          onChange={event => setName(event.target.value)} disabled={create.isPending} />
      </div>
      {create.isError && <p role="alert" className="text-sm text-destructive">{t("projects.createDialog.fallbackError")}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          {t(create.isPending ? "common.creating" : "projects.create")}
        </Button>
      </div>
    </form>
  )
}

function KeyStep({ userId, projectId, progress, onReady }: {
  userId: string
  projectId: string
  progress: QuickStartProgress
  onReady: (id: string) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(progress.secretName ?? quickStartSecretName)
  const { mutation, step, create } = useCreateLlmKey({
    projectId, secretId: progress.secretId,
    onCreated: secretId => {
      const current = readProgress(userId)
      if (current?.stage === "key" && current.projectId === projectId) saveProgress(userId, { ...current, secretId })
    },
    onReady,
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const requested = name.trim()
    if (!requested || mutation.isPending) return
    const current = readProgress(userId)
    if (current?.stage === "key" && current.projectId === projectId) {
      saveProgress(userId, { ...current, secretName: requested })
    }
    create(requested)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="w-full space-y-1.5">
        <Label htmlFor="quick-start-secret-name">{t("common.labels.name")}</Label>
        <Input id="quick-start-secret-name" value={name} maxLength={31} required autoComplete="off"
          onChange={event => setName(event.target.value)} disabled={mutation.isPending} className="font-mono" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("secrets.valueLabel")}</p>
        <p className="text-sm text-muted-foreground">
          <Trans i18nKey="quickStart.keyDescription" components={[<span className="text-foreground" />]} />
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!name.trim() || mutation.isPending}>
          {t(mutation.isPending ? "common.creating" : "secrets.create")}
        </Button>
      </div>
      {mutation.isPending && <p role="status" className="text-sm text-muted-foreground">{t(`models.${step}`)}</p>}
      {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error.message || t("models.error")}</p>}
    </form>
  )
}

function CreatedSecret({ projectId, secretId }: { projectId: string; secretId: string }) {
  const { t } = useTranslation()
  const secret = useSecret(projectId, secretId)
  return (
    <>
      <div className="w-full space-y-1.5">
        <Label htmlFor="quick-start-secret-name">{t("common.labels.name")}</Label>
        <Input id="quick-start-secret-name" value={secret.data?.name ?? ""} readOnly
          placeholder={secret.isPending ? t("common.loading") : undefined}
          className={`font-mono ${readOnlyInputClass}`} />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{t("secrets.valueLabel")}</p>
        <p className="text-sm text-muted-foreground">
          <Trans i18nKey="quickStart.keyCreated" components={[<span className="text-foreground" />]} />
        </p>
      </div>
    </>
  )
}

function QuickStart({ userId }: { userId: string }) {
  const { t } = useTranslation()
  const progress = useQuickStartProgress(userId)
  const stage = progress?.stage
  const projectId = progress?.projectId ?? ""
  const project = useProject(projectId)
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const [exitPath, setExitPath] = useState<string | null>(null)
  useEffect(() => {
    if (stage === "welcome") saveProgress(userId, { stage: "project" })
  }, [userId, stage])
  // Commit the destination before clearing progress, which also updates the route guard.
  useEffect(() => {
    if (exitPath) saveProgress(userId, null)
  }, [exitPath, userId])

  if (exitPath || !progress || stage === "initializing") return <Navigate to={exitPath ?? "/projects"} replace />
  const availableStep = stage === "ready" ? 3 : stage === "key" ? 2 : 1
  const stepParam = new URLSearchParams(location.search).get("step")
  const step = Number(stepParam)
  if (!stepParam || !/^[1-3]$/.test(stepParam) || step > availableStep) {
    return <Navigate to={`?step=${availableStep}`} replace />
  }
  const completed = step < availableStep
  const showResult = step === 3
  const headings = [
    completed ? "quickStart.projectCreated" : "quickStart.project",
    completed ? "secrets.createSuccess" : "quickStart.key",
  ]
  const missing = projectId && (project.isError || (project.data && (!project.data.is_active || project.data.owner_subject_id !== userId)))

  return (
    <PageStagger className={showResult
      ? "flex w-full min-w-0 flex-col gap-6"
      : "mx-auto flex w-full min-w-0 max-w-2xl flex-1 flex-col py-3 sm:py-5 before:h-0 before:min-h-0 before:shrink before:grow-0 before:content-[''] md:before:h-[24vh] md:before:max-h-80 after:min-h-0 after:flex-1 after:content-['']"}>
      <SlideIn className={showResult ? "flex flex-col gap-6" : "space-y-7 sm:px-7"}>
        <header className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="min-w-0 text-2xl font-semibold tracking-tight">{t("quickStart.title")}</h1>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {step > 1 && (
                <Button asChild size="sm" variant="ghost" className="h-auto px-1 py-0">
                  <Link to={`?step=${step - 1}`} aria-label={t("quickStart.back")}>
                    <ArrowLeft className="size-4" aria-hidden />
                  </Link>
                </Button>
              )}
              <p className="text-sm text-muted-foreground">{t("quickStart.step", { step })}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(step === 3 ? "quickStart.firstRequest" : step === 2 ? "quickStart.secretDescription" : "quickStart.description")}
          </p>
        </header>
        <div className="space-y-5">
          {!showResult && (
            <div className="space-y-2" aria-live="polite">
              <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                {step === 1 && <Home className="size-5 shrink-0" aria-hidden />}
                {step === 2 && <KeyRound className="size-5 shrink-0" aria-hidden />}
                {t(headings[step - 1])}
              </h2>
            </div>
          )}
          {missing ? (
            <div className="space-y-3" role="alert">
              <p className="text-sm text-destructive">{t("quickStart.projectUnavailable")}</p>
              <Button variant="outline" onClick={() => void project.refetch()}>{t("subscription.retry")}</Button>
              <Button variant="ghost" onClick={() => setExitPath("/projects")}>{t("nav.projects")}</Button>
            </div>
          ) : completed ? (
            <div className="flex flex-col gap-5">
              {step === 1 ? (
                <div className="w-full space-y-1.5">
                  <Label htmlFor="quick-project-name">{t("common.labels.name")}</Label>
                  <Input id="quick-project-name" value={project.data?.name ?? progress.projectName ?? ""} readOnly className={readOnlyInputClass} />
                </div>
              ) : progress.secretId ? (
                <CreatedSecret projectId={projectId} secretId={progress.secretId} />
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild><Link to={`?step=${step + 1}`}>{t("quickStart.next")}</Link></Button>
              </div>
            </div>
          ) : step === 1 ? (
            <ProjectStep userId={userId} savedName={progress.projectName} />
          ) : !project.data ? (
            <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : step === 2 ? (
            <KeyStep key={projectId} userId={userId} projectId={projectId} progress={progress} onReady={secretId => {
              const current = readProgress(userId)
              if (current?.stage !== "key" || current.projectId !== projectId) return
              saveProgress(userId, { ...current, stage: "ready", secretId })
              navigate("?step=3", { state: { issuedSecretId: secretId } })
            }} />
          ) : progress.secretId && (
            <QuickStartResult key={progress.secretId} userId={userId} projectId={projectId} secretId={progress.secretId}
              autoReveal={navigationType === "PUSH" && location.state?.issuedSecretId === progress.secretId} />
          )}
        </div>
      </SlideIn>
    </PageStagger>
  )
}

export function QuickStartPage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const info = usePlatformInfo()
  if (info.isError) return <Button className="self-start" variant="outline" onClick={() => void info.refetch()}>{t("subscription.retry")}</Button>
  if (info.isPending) return <p role="status">{t("common.loading")}</p>
  if (!user || !hasCloudQuickStart(info.data)) return <Navigate to="/projects" replace />
  return <QuickStart key={user.id} userId={user.id} />
}
