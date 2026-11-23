import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import { Button, TabsContent } from "@sb0rka/ui"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import { useCreateLlmKey } from "../use-create-llm-key"

export function ModelsTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const { mutation, step, create } = useCreateLlmKey({ projectId })
  const secretsHref = `/projects/${projectId}?tab=secrets`

  return (
    <TabsContent value="models" className="data-[state=inactive]:hidden">
      <PageStagger className="flex flex-col gap-6">
        <SlideIn>
          <h2 className="text-2xl font-semibold tracking-tight">{t("tabs.models")}</h2>
        </SlideIn>
        <SlideIn className="flex flex-col items-start gap-2">
          {mutation.isSuccess ? (
            <Button asChild>
              <Link to={`${secretsHref}&secret=${encodeURIComponent(mutation.data)}`}>{t("models.viewKey")}</Link>
            </Button>
          ) : (
            <Button type="button" disabled={mutation.isPending} aria-busy={mutation.isPending} onClick={() => create()}>
              {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              {t("models.create")}
            </Button>
          )}
          {mutation.isPending && <p role="status" className="text-sm text-muted-foreground">{t(`models.${step}`)}</p>}
          {mutation.isError && (
            <>
              <p role="alert" className="text-sm text-destructive">{mutation.error.message || t("models.error")}</p>
              <Link className="text-sm underline" to={secretsHref}>{t("models.openSecrets")}</Link>
            </>
          )}
        </SlideIn>
      </PageStagger>
    </TabsContent>
  )
}
