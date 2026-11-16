import { apiRequest } from "@/lib/api-client"

export interface DelegationConsent {
  request_id: string
  client_id: string
  client_name: string
  audience: string
  projects: { public_id: string; name: string }[]
  scopes: string[]
  csrf_token: string
}

export interface ConsentDecision {
  request_id: string
  csrf_token: string
  decision: "approve" | "deny"
  project_ids: string[]
  scopes: string[]
}

export function getDelegationConsent(requestId: string): Promise<DelegationConsent> {
  return apiRequest<DelegationConsent>({
    path: `/oauth2/delegations/consent/details?request_id=${encodeURIComponent(requestId)}`,
  })
}

export async function submitDelegationConsent(decision: ConsentDecision): Promise<string> {
  const response = await apiRequest<{ redirect_to: string }>({
    method: "POST",
    path: "/oauth2/delegations/consent",
    json: decision,
  })
  const target = new URL(response.redirect_to)
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("Invalid consent callback")
  }
  return target.toString()
}
