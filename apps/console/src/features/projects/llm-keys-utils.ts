import type { LLMModel, SecretResponse, SecretVersionDigestResponse, SecretVersionResponse } from "./api"

export function isLlmKeySecret(secret: Pick<SecretResponse, "versions">): boolean {
  return secret.versions?.some((version) => Boolean(version.digest)) ?? false
}

export function getCurrentLlmKeyDigest(
  secret: Pick<SecretResponse, "current_version_no" | "versions">,
): SecretVersionDigestResponse | undefined {
  const versions = secret.versions ?? []
  const current = versions.find(
    (version) => version.version_no === secret.current_version_no && version.digest,
  )
  if (current?.digest) return current.digest
  const latest = versions
    .filter((version) => version.digest)
    .sort((left, right) => right.version_no - left.version_no)[0]
  return latest?.digest
}

export function formatKeyDigestPreview(digest: Pick<SecretVersionDigestResponse, "prefix" | "postfix"> | undefined): string {
  if (!digest?.prefix || !digest.postfix) return "••••••••"
  return `${digest.prefix}••••${digest.postfix}`
}

export function getActivePreviousVersions(secret: Pick<SecretResponse, "current_version_no" | "versions">): SecretVersionResponse[] {
  return (secret.versions ?? [])
    .filter((version) => version.state === "active" && version.version_no !== secret.current_version_no)
    .sort((left, right) => right.version_no - left.version_no)
}

export function sameModelIds(left: Iterable<string>, right: Iterable<string>): boolean {
  const leftIds = [...left]
  const rightIds = new Set(right)
  if (leftIds.length !== rightIds.size) return false
  return leftIds.every((id) => rightIds.has(id))
}

export function mergeCatalogModels(catalog: LLMModel[], bound: LLMModel[]): LLMModel[] {
  const merged = new Map<string, LLMModel>()
  for (const model of catalog) merged.set(model.id, model)
  for (const model of bound) {
    if (!merged.has(model.id)) merged.set(model.id, model)
  }
  return [...merged.values()]
}
