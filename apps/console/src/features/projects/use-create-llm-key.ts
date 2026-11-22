import { useLayoutEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/features/auth/auth-provider"
import { ApiError } from "@/lib/api-client"
import { getAuthGeneration } from "@/lib/auth-store"
import { activeModelsQuery, createSecret, getSecretModels, listResourceTags, listSecrets, setSecretModels } from "./api"

interface KeyOptions {
  projectId: string
  name?: string
  secretId?: string
  onCreated?: (id: string) => void
  onReady?: (id: string) => void
}

function randomKeyName() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return "LLM_KEY_" + Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")
}

export function useCreateLlmKey({ projectId, name, secretId, onCreated, onReady }: KeyOptions) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const client = useQueryClient()
  const mounted = useRef(false)
  const running = useRef(false)
  const [keyName] = useState(() => name ?? randomKeyName())
  const [step, setStep] = useState<"discovering" | "generating" | "connecting">("discovering")
  useLayoutEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const mutation = useMutation({
    retry: false,
    mutationFn: async (requestedName: string) => {
      const keyName = requestedName
      const generation = getAuthGeneration()
      function checkSession() {
        if (!mounted.current || generation !== getAuthGeneration()) throw new Error(t("models.interrupted"))
      }
      setStep("discovering")
      const { models } = await client.fetchQuery({ ...activeModelsQuery, staleTime: 0, retry: false })
      checkSession()
      if (!models.length) throw new Error(t("models.noActiveModels"))

      async function findCreatedKey() {
        const { secrets } = await listSecrets(projectId)
        checkSession()
        const match = secrets.find(secret => secret.name === keyName)
        if (!match) return undefined
        const { tags } = await listResourceTags(projectId, match.public_id)
        checkSession()
        const isKey = tags.some(tag => tag.is_system && tag.tag_key === "__sb0rk_v" && tag.tag_value === "llm_key")
        if (match.created_by_subject_id !== user?.id || !isKey) throw new Error(t("models.creationUncertain"))
        return match.public_id
      }

      setStep("generating")
      // The name is stable across retries and unique within the project.
      let id = secretId
      let newlyCreated = false
      if (!id) {
        try {
          const created = await createSecret(projectId, {
            name: keyName,
            description: t("models.secretDescription"),
            purpose: "llm_key",
            payload_kind: "text",
            secret_value: "",
          })
          checkSession()
          id = created.public_id
          if (!id) throw new Error(t("models.creationUncertain"))
          newlyCreated = true
        } catch (error) {
          checkSession()
          if (error instanceof ApiError && error.status !== 409 && error.status < 500) throw error
          id = await findCreatedKey()
          if (!id) throw new Error(t("models.creationUncertain"))
        }
        void client.invalidateQueries({ queryKey: ["projects", projectId, "secrets"] })
        void client.invalidateQueries({ queryKey: ["projects", projectId, "resources"] })
      }
      if (!secretId) onCreated?.(id)

      setStep("connecting")
      const bound = newlyCreated ? [] : (await getSecretModels(projectId, id)).models
      checkSession()
      const activeIds = new Set(models.map(model => model.id))
      if (!bound.some(model => activeIds.has(model.id))) {
        await setSecretModels(projectId, id, [...activeIds])
        checkSession()
      }
      return id
    },
    onSuccess: id => { if (mounted.current) onReady?.(id) },
    onSettled: () => { running.current = false },
  })

  function create(requestedName?: string) {
    if (running.current || mutation.isSuccess) return
    const chosen = typeof requestedName === "string" && requestedName.trim() ? requestedName.trim() : keyName
    running.current = true
    mutation.mutate(chosen)
  }
  return { mutation, step, create }
}
