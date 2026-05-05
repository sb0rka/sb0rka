export type ExplainStyleKey =
  | "breakdown"
  | "haiku"
  | "shakespeare"
  | "snoopDog"
  | "stephenKing"
  | "caveman"

export const EXPLAIN_STYLE_ORDER: ExplainStyleKey[] = [
  "breakdown",
  "haiku",
  "shakespeare",
  "snoopDog",
  "stephenKing",
  "caveman",
]

/** Prompt fragment sent as nl2sql `style` (empty uses server default breakdown). */
export function explainStylePrompt(key: ExplainStyleKey): string {
  switch (key) {
    case "breakdown":
      return ""
    case "haiku":
      return "Explain this SQL as a haiku (or a short series of haikus)."
    case "shakespeare":
      return "Explain in Elizabethan English verse in the voice and vocabulary of Shakespeare."
    case "snoopDog":
      return "Explain in relaxed, playful verse in the style of Snoop Dogg."
    case "stephenKing":
      return "Explain with vivid, suspenseful narrative prose in the style of Stephen King."
    case "caveman":
      return "Explain in exaggerated primitive caveman-style broken English: very short choppy sentences, simple words only, grunts optional—humorous but still technically accurate about what the SQL does."
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
