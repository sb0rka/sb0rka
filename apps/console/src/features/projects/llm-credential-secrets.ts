import type { QueryClient } from "@tanstack/react-query"
import type { SecretListResponse, SecretResponse } from "./api"

export const LLM_BASE_URL_SECRET_NAME = "llm_base_url"
export const LLM_API_KEY_SECRET_NAME = "llm_api_key"

export function normalizeSecretName(name: string): string {
  return name.trim().toLowerCase()
}

export function isLlmCredentialSecretName(name: string): boolean {
  const normalized = normalizeSecretName(name)
  return normalized === LLM_BASE_URL_SECRET_NAME || normalized === LLM_API_KEY_SECRET_NAME
}

export function hasRequiredLlmCredentialSecrets(secrets: { name: string }[]): boolean {
  const names = new Set(secrets.map((secret) => normalizeSecretName(secret.name)))
  return names.has(LLM_BASE_URL_SECRET_NAME) && names.has(LLM_API_KEY_SECRET_NAME)
}

export function findLlmCredentialSecrets(secrets: SecretResponse[]): {
  baseUrl: SecretResponse
  apiKey: SecretResponse
} | null {
  const byName = new Map(secrets.map((secret) => [normalizeSecretName(secret.name), secret]))
  const baseUrl = byName.get(LLM_BASE_URL_SECRET_NAME)
  const apiKey = byName.get(LLM_API_KEY_SECRET_NAME)
  if (!baseUrl || !apiKey) return null
  return { baseUrl, apiKey }
}

function getSecretNameFromCache(
  qc: QueryClient,
  projectId: string,
  resourceId: string,
): string | undefined {
  const secrets = qc.getQueryData<SecretListResponse>(["projects", projectId, "secrets"])?.secrets ?? []
  return secrets.find((secret) => secret.resource_id === resourceId)?.name
}

export function invalidateLlmExplorerCredentials(qc: QueryClient, projectId: string): void {
  void qc.invalidateQueries({
    queryKey: ["projects", projectId, "dataExplorer", "openaiConfig"],
  })
  void qc.invalidateQueries({
    queryKey: ["projects", projectId, "mobileDataExplorer", "openaiConfig"],
  })
  void qc.invalidateQueries({
    queryKey: ["projects", projectId, "dataExplorer", "openaiModels"],
  })
  void qc.invalidateQueries({
    queryKey: ["projects", projectId, "mobileDataExplorer", "openaiModels"],
  })
}

export function invalidateLlmExplorerCredentialsIfSecret(
  qc: QueryClient,
  projectId: string,
  secretName: string | undefined,
): void {
  if (secretName && isLlmCredentialSecretName(secretName)) {
    invalidateLlmExplorerCredentials(qc, projectId)
  }
}

export function invalidateLlmExplorerCredentialsIfResource(
  qc: QueryClient,
  projectId: string,
  resourceId: string,
): void {
  invalidateLlmExplorerCredentialsIfSecret(
    qc,
    projectId,
    getSecretNameFromCache(qc, projectId, resourceId),
  )
}
