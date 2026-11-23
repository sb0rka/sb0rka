import { useQuery, useQueryClient } from "@tanstack/react-query"
import { verifyEmailCheck } from "@/features/auth/api"
import { listProjects } from "@/features/projects/api"
import { getAccountPlan, initializeAccount, isNotFound } from "@/features/subscription/api"
import { hasCloudQuickStart, isCommunityEdition, usePlatformInfo } from "@/features/system/info"
import { readProgress, saveProgress } from "./progress"

export function useAccountEntry(userId: string) {
  const client = useQueryClient()
  const info = usePlatformInfo()
  const cloud = hasCloudQuickStart(info.data)
  const community = isCommunityEdition(info.data)
  const emailKey = ["email-verified", userId]
  const email = useQuery({
    queryKey: emailKey,
    queryFn: async () => (await verifyEmailCheck()).verified,
    enabled: Boolean(userId && info.data && !community),
    retry: false,
  })
  const account = useQuery({
    queryKey: ["account-entry", userId, cloud],
    enabled: Boolean(userId && info.data && (community || email.data === true)),
    retry: false,
    queryFn: async () => {
      try {
        const plan = await getAccountPlan()
        client.setQueryData(["subscription", "account-plan"], plan)
        if (!cloud || readProgress(userId)?.stage !== "initializing") return true
      } catch (error) {
        if (!isNotFound(error)) throw error
        // Remember a first initialization even if the response is lost or the page reloads.
        if (cloud && !readProgress(userId)) saveProgress(userId, { stage: "initializing" })
        await initializeAccount()
        await client.invalidateQueries({ queryKey: ["subscription", "account-plan"] })
      }

      const result = await listProjects()
      client.setQueryData(["projects"], result)
      if (cloud && readProgress(userId)?.stage === "initializing") {
        saveProgress(userId, result.projects.length ? null : { stage: "welcome" })
      }
      return true
    },
  })
  const failed = info.isError ? info : !community && email.isError ? email : account.isError ? account : null
  return {
    cloud,
    verify: !community && email.data === false,
    verified: async () => {
      await client.cancelQueries({ queryKey: emailKey, exact: true })
      client.setQueryData(emailKey, true)
    },
    ready: account.isSuccess,
    failed,
  }
}
