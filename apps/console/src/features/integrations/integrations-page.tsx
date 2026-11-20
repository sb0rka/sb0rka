import { useTranslation } from "react-i18next"
import { ExternalLink } from "lucide-react"
import {
  Badge,
  Button,
  buttonPressClass,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from "@sb0rka/ui"
import { PageStagger, SlideIn, StaggerGroup } from "@/components/motion/page-entrance"
import type { IntegrationStatus } from "./api"
import { useIntegrations } from "./hooks"

const integrationIds = ["som", "ir"] as const

type IntegrationId = (typeof integrationIds)[number]

const integrationHref: Record<IntegrationId, string> = {
  som: "https://som.sb0rka.ru",
  ir: "https://ir.sb0rka.ru",
}

function IntegrationCard({ id, status }: { id: IntegrationId; status: IntegrationStatus }) {
  const { t } = useTranslation()
  const name = t(`integrations.${id}.name`)

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="h-full gap-3">
        <div className="flex w-full items-center gap-3">
          <CardTitle className="flex min-w-0 flex-1 items-center gap-2 text-xl font-semibold leading-normal tracking-[-0.3px]">
            <span className="min-w-0">{name}</span>
            {status.available ? (
              <a
                href={integrationHref[id]}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("integrations.open", { name })}
                className={cn(
                  "inline-flex shrink-0 text-muted-foreground hover:text-foreground",
                  buttonPressClass,
                )}
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            ) : null}
          </CardTitle>
          <Badge
            variant={status.available ? "active" : "inactive"}
            className="shrink-0 px-2.5 py-0.5 text-xs font-semibold leading-4"
          >
            {t(status.available ? "integrations.available" : "integrations.unavailable")}
          </Badge>
        </div>
        <CardDescription className="w-full leading-5">
          {t(`integrations.${id}.description`)}
        </CardDescription>
        {status.available && status.active_sessions > 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("integrations.activeSessions", { count: status.active_sessions })}
          </p>
        ) : null}
      </CardHeader>
    </Card>
  )
}

export function IntegrationsPage() {
  const { t } = useTranslation()
  const query = useIntegrations()

  return (
    <PageStagger className="flex flex-col gap-6">
      <SlideIn className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">{t("nav.integrations")}</h1>
        <p className="max-w-2xl text-sm leading-5 text-muted-foreground">{t("integrations.lead")}</p>
      </SlideIn>
      <SlideIn>
        {query.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : query.isError ? (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="text-sm text-destructive">{t("integrations.loadError")}</p>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              {t("integrations.retry")}
            </Button>
          </div>
        ) : (
          <StaggerGroup className="grid gap-4 md:grid-cols-2">
            {integrationIds.map((id) => (
              <SlideIn key={id} className="h-full">
                <IntegrationCard id={id} status={query.data[id]} />
              </SlideIn>
            ))}
          </StaggerGroup>
        )}
      </SlideIn>
    </PageStagger>
  )
}
