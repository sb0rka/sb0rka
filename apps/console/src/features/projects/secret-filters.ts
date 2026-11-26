import type { SecretResponse } from "./api"
import { isLlmKeySecret } from "./llm-keys-utils"

export const secretCategories = ["llm", "db", "user"] as const
export type SecretCategory = (typeof secretCategories)[number]
export const secretFilters = ["all", ...secretCategories] as const
export type SecretFilter = (typeof secretFilters)[number]

export interface SecretFilterCounts {
  all: number
  llm: number | null
  db: number | null
  user: number | null
}

export function parseSecretFilter(raw: string | null): SecretFilter {
  if (raw === "llm" || raw === "db" || raw === "user") return raw
  return "all"
}

export function classifySecret(
  secret: Pick<SecretResponse, "versions" | "password_verifier">,
): SecretCategory {
  if (isLlmKeySecret(secret)) return "llm"
  if (secret.password_verifier) return "db"
  return "user"
}

export function secretsListHref(projectId: string, filter: SecretFilter): string {
  const base = `/projects/${projectId}?tab=secrets`
  return filter === "all" ? base : `${base}&type=${filter}`
}
