import { apiRequest } from "@/lib/api-client"

export type IntegrationStatus =
  | { available: true; active_sessions: number }
  | { available: false }

export type IntegrationsResponse = { som: IntegrationStatus; ir: IntegrationStatus }

function toStatus(value: unknown): IntegrationStatus {
  if (!value || typeof value !== "object") return { available: false }
  const row = value as { available?: unknown; active_sessions?: unknown }
  if (row.available !== true) return { available: false }
  const count = typeof row.active_sessions === "number" ? row.active_sessions : 0
  return { available: true, active_sessions: count }
}

function normalizeIntegrations(data: unknown): IntegrationsResponse {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {}
  return {
    som: toStatus(record.som),
    ir: toStatus(record.ir),
  }
}

export async function getIntegrations() {
  const data = await apiRequest<unknown>({ base: "auth", path: "/auth/integrations" })
  return normalizeIntegrations(data)
}
