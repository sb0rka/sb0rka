import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/features/auth/auth-provider"
import { getIntegrations } from "./api"

export function useIntegrations() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["integrations", user?.id],
    queryFn: getIntegrations,
    enabled: Boolean(user?.id),
    // A minute is enough for session counts.
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  })
}
