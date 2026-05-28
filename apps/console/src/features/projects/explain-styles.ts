/**
 * Must match `explainStyleNoneSentinel` in apps/nl2sql/internal/httpapi/handler.go.
 */
export const EXPLAIN_STYLE_NONE_SENTINEL =
  "Return no text at all for the explanation: your entire reply must be empty (zero characters, no whitespace)."

export type ExplainStyleKey =
  | "none"
  | "short"
  | "detailed"
  | "haiku"

export const EXPLAIN_STYLE_ORDER: ExplainStyleKey[] = [
  "none",
  "detailed",
  "short",
  "haiku",
]

/** Prompt fragment sent as nl2sql `style`. */
export function explainStylePrompt(key: ExplainStyleKey): string {
  switch (key) {
    case "none":
      return EXPLAIN_STYLE_NONE_SENTINEL
    case "detailed":
      return "Explain like I'm a good software engineer, but I don't use SQL a lot."
    case "short":
      return "Explain like I'm an SQL specialist."
    case "haiku":
      return "Explain this SQL as 1-2 haiku verses."
    default: {
      const _exhaustive: never = key
      return _exhaustive
    }
  }
}

export function explainStyleLabelKey(key: ExplainStyleKey): string {
  switch (key) {
    case "none":
      return "dataExplorer.styleNone"
    case "detailed":
      return "dataExplorer.styleDetailed"
    case "short":
      return "dataExplorer.styleShort"
    case "haiku":
      return "dataExplorer.styleHaiku"
    default: {
      const _x: never = key
      return _x
    }
  }
}

/** Map stored nl2sql style prompt back to a preset key for the UI (unknown -> none). */
export function explainStyleKeyFromPrompt(prompt: string): ExplainStyleKey {
  const t = prompt.trim()
  if (t === "") return "none"
  for (const key of EXPLAIN_STYLE_ORDER) {
    if (explainStylePrompt(key) === t) return key
  }
  return "none"
}
