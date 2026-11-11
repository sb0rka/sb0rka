import { useLayoutEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import { Button, TabsContent } from "@sb0rka/ui"
import { PageStagger, SlideIn } from "@/components/motion/page-entrance"
import { ApiError } from "@/lib/api-client"
import { getAuthGeneration } from "@/lib/auth-store"
import { createSecret, listActiveModels, setSecretModels } from "../api"

class UnconfirmedSecretCreationError extends Error {}

export function ModelsTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const mounted = useRef(false)
  const running = useRef(false)
  const secretId = useRef<string | null>(null)
  const [step, setStep] = useState<"generating" | "discovering" | "connecting">("generating")

  useLayoutEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const createKey = useMutation({
    retry: 0,
    mutationFn: async (generation: number) => {
      const isCurrent = () => mounted.current && generation === getAuthGeneration()
      const requireCurrent = () => {
        if (!isCurrent()) throw new Error(t("models.interrupted"))
      }
      const invalidateSecrets = () => {
        void queryClient.invalidateQueries({ queryKey: ["projects", projectId, "secrets"] })
        void queryClient.invalidateQueries({ queryKey: ["projects", projectId, "resources"] })
      }

      requireCurrent()
      if (!secretId.current) {
        setStep("generating")
        const suffix = Array.from(
          crypto.getRandomValues(new Uint8Array(3)),
          (byte) => byte.toString(16).padStart(2, "0"),
        ).join("")

        try {
          const created = await createSecret(projectId, {
            name: `LLM_KEY_${suffix}`,
            purpose: "llm_key",
            payload_kind: "text",
            secret_value: "",
          })
          if (!created?.public_id) throw new Error(t("models.creationUncertain"))
          secretId.current = created.public_id
        } catch (error) {
          if (isCurrent() && (!(error instanceof ApiError) || error.status >= 500)) {
            invalidateSecrets()
            throw new UnconfirmedSecretCreationError(t("models.creationUncertain"))
          }
          throw error
        }

        if (generation === getAuthGeneration()) invalidateSecrets()
      }

      requireCurrent()
      setStep("discovering")
      const { models } = await listActiveModels()
      requireCurrent()
      if (!models.length) throw new Error(t("models.noActiveModels"))

      setStep("connecting")
      await setSecretModels(
        projectId,
        secretId.current,
        models.map((model) => model.id),
      )
      requireCurrent()
      return secretId.current
    },
    onError: (error) => {
      running.current = error instanceof UnconfirmedSecretCreationError
    },
  })

  function handleCreate() {
    if (running.current) return
    running.current = true
    createKey.mutate(getAuthGeneration())
  }

  const secretsHref = `/projects/${projectId}?tab=secrets`
  const creationUncertain = createKey.error instanceof UnconfirmedSecretCreationError

  return (
    <TabsContent value="models" className="data-[state=inactive]:hidden">
      <PageStagger className="flex flex-col gap-6">
        <SlideIn>
          <h2 className="text-2xl font-semibold tracking-tight">{t("tabs.models")}</h2>
        </SlideIn>
        <SlideIn className="flex flex-col items-start gap-2">
          {createKey.isSuccess || creationUncertain ? (
            <Button asChild>
              <Link
                to={createKey.isSuccess
                  ? `${secretsHref}&secret=${encodeURIComponent(createKey.data)}`
                  : secretsHref}
              >
                {t(createKey.isSuccess ? "models.viewKey" : "models.openSecrets")}
              </Link>
            </Button>
          ) : (
            <Button
              type="button"
              disabled={createKey.isPending}
              aria-busy={createKey.isPending}
              onClick={handleCreate}
            >
              {createKey.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              )}
              {t("models.create")}
            </Button>
          )}
          {createKey.isPending && (
            <p role="status" className="text-sm text-muted-foreground">
              {t(`models.${step}`)}
            </p>
          )}
          {createKey.isError && (
            <p role="alert" className="text-sm text-destructive">
              {createKey.error?.message || t("models.error")}
            </p>
          )}
        </SlideIn>
      </PageStagger>
    </TabsContent>
  )
}
