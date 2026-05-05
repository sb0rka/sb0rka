/**
 * Must match `explainStyleNoneSentinel` in apps/nl2sql/internal/httpapi/handler.go.
 */
export const EXPLAIN_STYLE_NONE_SENTINEL =
  "Return no text at all for the explanation: your entire reply must be empty (zero characters, no whitespace)."

export type ExplainStyleKey =
  | "none"
  | "short"
  | "breakdown"
  | "haiku"
  | "homer"
  | "russianBylina"

export const EXPLAIN_STYLE_ORDER: ExplainStyleKey[] = [
  "none",
  "short",
  "breakdown",
  "haiku",
  "homer",
  "russianBylina",
]

/** Prompt fragment sent as nl2sql `style` (empty uses server default breakdown). */
export function explainStylePrompt(key: ExplainStyleKey): string {
  switch (key) {
    case "none":
      return EXPLAIN_STYLE_NONE_SENTINEL
    case "short":
      return "Keep it short: at most a short paragraph (roughly 5–8 sentences) covering intent, main joins and filters, and what the result set represents—no exhaustive clause-by-clause breakdown."
    case "breakdown":
      return ""
    case "haiku":
      return "Explain this SQL as a haiku (or a short series of haikus)."
    case "homer":
      return "Explain in English using the elevated, epithet-rich narrative voice of Homeric epic (like the Iliad or Odyssey): rolling sentences, vivid comparisons where natural, and heroic gravity—while staying technically accurate about the SQL."
    case "russianBylina":
      return "Объясни SQL в духе русской былины: торжественный народный эпос, устойчивые формулы и параллелизмы, архаичный колорит; текст ответа на русском."
    default: {
      const _exhaustive: never = key
      return _exhaustive
    }
  }
}

/** Map stored nl2sql style prompt back to a preset key for the UI (unknown → breakdown). */
export function explainStyleKeyFromPrompt(prompt: string): ExplainStyleKey {
  const t = prompt.trim()
  if (t === "") return "breakdown"
  for (const key of EXPLAIN_STYLE_ORDER) {
    if (explainStylePrompt(key) === t) return key
  }
  return "breakdown"
}
