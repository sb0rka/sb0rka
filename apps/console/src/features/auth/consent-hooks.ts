import { useMutation, useQuery } from "@tanstack/react-query"
import { getDelegationConsent, submitDelegationConsent } from "./consent-api"

export function useDelegationConsent(requestId: string, userId: string) {
  return useQuery({
    queryKey: ["delegation-consent", requestId, userId],
    queryFn: () => getDelegationConsent(requestId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
}

export function useConsentDecision() {
  return useMutation({
    mutationFn: submitDelegationConsent,
    onSuccess: (redirectTo) => window.location.replace(redirectTo),
    retry: false,
  })
}
