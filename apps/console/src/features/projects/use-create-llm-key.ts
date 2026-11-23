import { useLayoutEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useAuth } from "@/features/auth/auth-provider"
import { ApiError } from "@/lib/api-client"
import { getAuthGeneration } from "@/lib/auth-store"
import { activeModelsQuery, attachResourceTag, createSecret, getSecretModels, listResourceTags, listSecrets, setSecretModels } from "./api"

interface KeyOptions {
  projectId: string
  name?: string
  secretId?: string
  onCreated?: (id: string) => void
  onReady?: (id: string) => void
}

export interface CreateLlmKeyOptions {
  name?: string
  description?: string
  modelIds?: string[]
  tagModels?: boolean
}

export interface ModelTagNotice {
  skipped: string[]
  failed: boolean
}

const MODEL_TAG_KEY = "model"
const MODEL_TAG_VALUE_MAX = 63

export function suggestLlmKeyName() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return "LLM_KEY_" + Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")
}

function sameIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const known = new Set(right)
  return left.every(id => known.has(id))
}

export function useCreateLlmKey({ projectId, name, secretId, onCreated, onReady }: KeyOptions) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const client = useQueryClient()
  const mounted = useRef(false)
  const running = useRef(false)
  const [keyName] = useState(() => name ?? suggestLlmKeyName())
  const [step, setStep] = useState<"discovering" | "generating" | "connecting" | "tagging">("discovering")
  const [tagNotice, setTagNotice] = useState<ModelTagNotice | null>(null)
  useLayoutEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const mutation = useMutation({
    retry: false,
    mutationFn: async (input: CreateLlmKeyOptions) => {
      setTagNotice(null)
      const keyName = input.name?.trim() || ""
      if (!keyName) throw new Error(t("models.error"))
      const description = input.description?.trim() || t("models.secretDescription")
      const explicitIds = input.modelIds
      const generation = getAuthGeneration()
      function checkSession() {
        if (!mounted.current || generation !== getAuthGeneration()) throw new Error(t("models.interrupted"))
      }
      setStep("discovering")
      const { models } = await client.fetchQuery({ ...activeModelsQuery, staleTime: 0, retry: false })
      checkSession()
      if (!models.length) throw new Error(t("models.noActiveModels"))
      const activeIds = new Set(models.map(model => model.id))
      // Quick start omits modelIds and keeps binding every active model.
      // The models tab passes the user's selection and must not widen it.
      const targetIds = explicitIds
        ? [...new Set(explicitIds)].filter(id => activeIds.has(id))
        : [...activeIds]
      if (!targetIds.length) throw new Error(t("models.selectionUnavailable"))

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
            description,
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
      const boundIds = bound.map(model => model.id)
      const shouldBind = explicitIds
        ? !sameIds(targetIds, boundIds)
        : !bound.some(model => activeIds.has(model.id))
      if (shouldBind) {
        await setSecretModels(projectId, id, targetIds)
        checkSession()
      }

      if (input.tagModels) {
        setStep("tagging")
        const slugs = [...new Set(
          models
            .filter((model) => targetIds.includes(model.id))
            .map((model) => model.slug.trim())
            .filter(Boolean),
        )]
        const skipped: string[] = []
        let failed = false
        for (const slug of slugs) {
          if ([...slug].length > MODEL_TAG_VALUE_MAX) {
            skipped.push(slug)
            continue
          }
          try {
            await attachResourceTag(projectId, id, { tag_key: MODEL_TAG_KEY, tag_value: slug })
            checkSession()
          } catch {
            checkSession()
            failed = true
          }
        }
        void client.invalidateQueries({ queryKey: ["projects", projectId, "resources", id, "tags"] })
        if (mounted.current && (skipped.length > 0 || failed)) {
          setTagNotice({ skipped, failed })
        }
      }
      return id
    },
    onSuccess: id => { if (mounted.current) onReady?.(id) },
    onSettled: () => { running.current = false },
  })

  function create(requested?: string | CreateLlmKeyOptions) {
    if (running.current || mutation.isSuccess) return
    const input: CreateLlmKeyOptions = typeof requested === "string" || requested == null
      ? { name: typeof requested === "string" && requested.trim() ? requested.trim() : keyName }
      : {
          name: requested.name?.trim() || keyName,
          description: requested.description,
          modelIds: requested.modelIds,
          tagModels: requested.tagModels,
        }
    running.current = true
    mutation.mutate(input)
  }

  function reset() {
    if (running.current) return
    setStep("discovering")
    setTagNotice(null)
    mutation.reset()
  }

  return { mutation, step, tagNotice, create, reset }
}
