import type { DraftTag } from "./components/project-detail-tab-types"

/**
 * Stored as `tag_key` when the user enters a bare value (no `:`). The API requires a non-empty key.
 * Must not collide with explicit user keys users would type before `:` — pick an internal-looking name.
 */
export const VALUE_ONLY_TAG_KEY = "__sb0rk_v"

export function parseDraftTag(input: string): DraftTag | null {
  const normalized = input.trim()
  if (!normalized) return null

  const separatorIndex = normalized.indexOf(":")
  if (separatorIndex === -1) {
    return { tag_key: VALUE_ONLY_TAG_KEY, tag_value: normalized }
  }

  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
    return null
  }

  const tag_key = normalized.slice(0, separatorIndex).trim()
  const tag_value = normalized.slice(separatorIndex + 1).trim()
  if (!tag_key || !tag_value) return null

  return { tag_key, tag_value }
}

export function formatDraftTagLabel(tag: Pick<DraftTag, "tag_key" | "tag_value">): string {
  if (tag.tag_key === VALUE_ONLY_TAG_KEY) {
    return tag.tag_value
  }
  return `${tag.tag_key}:${tag.tag_value}`
}
