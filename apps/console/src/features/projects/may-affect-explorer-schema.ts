/**
 * Heuristic: true if SQL may change objects shown in the Data Explorer (tables,
 * views, columns) — i.e. likely PostgreSQL DDL starting a statement with
 * CREATE, ALTER, or DROP. Not a full SQL parser; see plan for limitations.
 */
export function mayAffectExplorerSchema(sql: string): boolean {
  const cleaned = stripLineComments(stripBlockComments(sql))
  for (const part of cleaned.split(";")) {
    const first = firstWordToken(part)
    if (!first) continue
    if (first === "create" || first === "alter" || first === "drop") return true
  }
  return false
}

function stripBlockComments(s: string): string {
  let out = ""
  let i = 0
  while (i < s.length) {
    if (s[i] === "/" && s[i + 1] === "*") {
      const end = s.indexOf("*/", i + 2)
      if (end === -1) break
      i = end + 2
      continue
    }
    out += s[i]!
    i += 1
  }
  return out
}

function stripLineComments(s: string): string {
  return s
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--")
      if (idx === -1) return line
      return line.slice(0, idx)
    })
    .join("\n")
}

function firstWordToken(stmt: string): string | null {
  let i = 0
  while (i < stmt.length && /\s/.test(stmt[i]!)) i++
  if (i >= stmt.length) return null
  if (!/[A-Za-z_]/.test(stmt[i]!)) return null
  const start = i
  while (i < stmt.length && /[A-Za-z0-9_]/.test(stmt[i]!)) i++
  return stmt.slice(start, i).toLowerCase()
}
