import { useState } from "react"
import { Navigate, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Label,
  ThemeToggle,
} from "@sb0rka/ui"
import { LanguageSwitcher } from "@/components/language-switcher"
import { ApiError } from "@/lib/api-client"
import { useAuth } from "./auth-provider"
import { LoginPage } from "./login-page"
import { useConsentDecision, useDelegationConsent } from "./consent-hooks"

const scopeLabels: Record<string, string> = {
  "projects.read": "auth.consent.scopes.projectsRead",
  "resources.read": "auth.consent.scopes.resourcesRead",
  "secrets.create": "auth.consent.scopes.secretsCreate",
  "secrets.write": "auth.consent.scopes.secretsWrite",
  "secrets.read": "auth.consent.scopes.secretsRead",
  "secrets.reveal": "auth.consent.scopes.secretsReveal",
  "ir.gateway.use": "auth.consent.scopes.irGatewayUse",
}

function keepConsentOpen() {}

export function ConsentEntry() {
  const [params] = useSearchParams()
  const { isLoading, isAuthenticated, user } = useAuth()
  const { t } = useTranslation()
  if (!params.has("consent_request_id")) return <Navigate to="/projects" replace />
  if (window.top !== window.self) return <ConsentMessage message={t("auth.consent.framed")} />

  const requestIds = params.getAll("consent_request_id")
  const requestId = requestIds[0] ?? ""
  if (
    [...params.keys()].length !== 1 ||
    requestIds.length !== 1 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId) ||
    requestId === "00000000-0000-0000-0000-000000000000"
  ) {
    return <ConsentMessage message={t("auth.consent.invalid")} />
  }
  if (isLoading) return <ConsentMessage message={t("common.loading")} />
  if (!isAuthenticated || !user) return <LoginPage onLoginSuccess={keepConsentOpen} />
  return <ConsentPage key={`${requestId}:${user.id}`} requestId={requestId} userId={user.id} />
}

function ConsentMessage({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-lg">
        <CardHeader><CardTitle>{message}</CardTitle></CardHeader>
      </Card>
    </div>
  )
}

function ConsentPage({ requestId, userId }: { requestId: string; userId: string }) {
  const { t } = useTranslation()
  const consent = useDelegationConsent(requestId, userId)
  const decision = useConsentDecision()
  const [projects, setProjects] = useState<string[]>([])

  function errorMessage(error: unknown) {
    if (error instanceof ApiError) {
      if (error.status === 410) return t("auth.consent.expired")
      if (error.status === 403) return t("auth.consent.forbidden")
      if (error.status === 401) return t("auth.consent.sessionExpired")
      if (error.status === 400) return t("auth.consent.invalid")
    }
    return t("auth.consent.unavailable")
  }

  function toggle(values: string[], value: string, selected: boolean) {
    return selected ? [...values, value] : values.filter((current) => current !== value)
  }

  const data = consent.data
  const error = decision.error ?? consent.error
  const closed = error instanceof ApiError && (error.status === 410 || error.status === 401 || error.status === 403)
  const busy = decision.isPending || decision.isSuccess

  function submit(value: "approve" | "deny") {
    if (!data || busy || closed) return
    decision.mutate({
      request_id: requestId,
      csrf_token: data.csrf_token,
      decision: value,
      project_ids: value === "approve" ? projects : [],
      scopes: value === "approve" ? data.scopes : [],
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <div className="absolute right-4 top-4 flex gap-2"><ThemeToggle /><LanguageSwitcher /></div>
      <Card className="my-14 w-full max-w-lg">
        <CardHeader>
          <CardTitle>{data ? t("auth.consent.title", { client: data.client_name }) : t(error ? "auth.consent.errorTitle" : "auth.consent.loading")}</CardTitle>
          <CardDescription>
            {t("auth.consent.description")}
            {data && <> <strong className="font-bold text-foreground">{data.client_id} · {data.audience}</strong></>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {consent.isPending && <p role="status">{t("common.loading")}</p>}
          {error && <p role="alert" className="text-sm text-destructive">{errorMessage(error)}</p>}
          {data && !closed && (
            <>
              <fieldset disabled={busy} className="space-y-3">
                <legend className="mb-2 font-medium">{t("auth.consent.projects")}</legend>
                {data.projects.length === 0 && <p className="text-sm text-muted-foreground">{t("auth.consent.noProjects")}</p>}
                {data.projects.map((project) => (
                  <div key={project.public_id} className="flex items-start gap-3">
                    <Checkbox
                      id={`consent-project-${project.public_id}`}
                      className="mt-0.5"
                      checked={projects.includes(project.public_id)}
                      onCheckedChange={(checked) => setProjects((current) => toggle(current, project.public_id, checked === true))}
                    />
                    <Label htmlFor={`consent-project-${project.public_id}`} className="cursor-pointer font-normal leading-5 break-all">
                      {project.name}
                    </Label>
                  </div>
                ))}
              </fieldset>
              <fieldset disabled={busy} className="space-y-3">
                <legend className="mb-2 font-medium">{t("auth.consent.permissions")}</legend>
                {data.scopes.map((scope) => (
                  <div key={scope} className="flex items-start gap-3">
                    <Checkbox id={`consent-scope-${scope}`} className="mt-0.5" checked disabled />
                    <Label htmlFor={`consent-scope-${scope}`} className="font-normal leading-5">
                      {scopeLabels[scope] ? t(scopeLabels[scope]) : scope}
                    </Label>
                  </div>
                ))}
              </fieldset>
              <p className="text-sm text-muted-foreground">{t("auth.consent.selectionHint")}</p>
            </>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-3">
          {data && !closed && (
            <>
              <Button disabled={busy || projects.length === 0 || data.scopes.length === 0} onClick={() => submit("approve")}>
                {busy ? t("auth.consent.submitting") : t("auth.consent.approve")}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => submit("deny")}>{t("auth.consent.deny")}</Button>
            </>
          )}
          {error && !busy && (
            <Button variant="outline" onClick={() => {
              decision.reset()
              setProjects([])
              void consent.refetch()
            }}>{t("auth.login.continueRetry")}</Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
