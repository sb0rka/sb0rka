import { ApiError } from "@/lib/api-client"
import type { AiQueryChatMessage } from "./use-ai-query-chat"

type AssistantType = "thinking" | "sql" | "fix"

function findLastUserIndex(messages: AiQueryChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return i
  }
  return -1
}

function findAssistantIndexInCurrentTurn(
  messages: AiQueryChatMessage[],
  type: AssistantType,
  occurrence = 1,
): number {
  const start = findLastUserIndex(messages) + 1
  let seen = 0
  for (let i = start; i < messages.length; i++) {
    const current = messages[i]
    if (current?.role === "assistant" && current.type === type) {
      seen += 1
      if (seen === occurrence) return i
    }
  }
  return -1
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (error instanceof DOMException && error.name === "AbortError") return true
  if (error instanceof Error && error.name === "AbortError") return true
  return false
}

export function pruneEmptyAssistantMessages(messages: AiQueryChatMessage[]): AiQueryChatMessage[] {
  return messages.filter((message) => {
    if (message.role !== "assistant") return true
    if (message.type === "thinking" || message.type === "sql") {
      return message.output.trim().length > 0
    }
    if (message.type === "fix") {
      return message.explanation.trim().length > 0
    }
    return true
  })
}

export function upsertFixExplanationInCurrentTurn(
  messages: AiQueryChatMessage[],
  explanation: string,
): AiQueryChatMessage[] {
  if (!explanation.trim()) return messages
  const next = [...messages]
  const fixIndex = findAssistantIndexInCurrentTurn(next, "fix")
  if (fixIndex >= 0) {
    const current = next[fixIndex]
    if (current?.role === "assistant" && current.type === "fix") {
      next[fixIndex] = { ...current, explanation }
      return next
    }
  }
  next.push({
    role: "assistant",
    type: "fix",
    explanation,
  })
  return next
}

export function upsertThinkingInCurrentTurn(
  messages: AiQueryChatMessage[],
  output: string,
  occurrence = 1,
): AiQueryChatMessage[] {
  const next = [...messages]
  const thinkingIndex = findAssistantIndexInCurrentTurn(next, "thinking", occurrence)
  if (thinkingIndex >= 0) {
    next[thinkingIndex] = { role: "assistant", type: "thinking", output }
    return next
  }
  next.push({ role: "assistant", type: "thinking", output })
  return next
}

export function upsertSqlInCurrentTurn(
  messages: AiQueryChatMessage[],
  output: string,
): AiQueryChatMessage[] {
  if (!output.trim()) return messages
  const next = [...messages]
  const sqlIndex = findAssistantIndexInCurrentTurn(next, "sql")
  if (sqlIndex >= 0) {
    next[sqlIndex] = { role: "assistant", type: "sql", output }
    return next
  }
  next.push({ role: "assistant", type: "sql", output })
  return next
}

export function finalizeSqlInCurrentTurn(
  messages: AiQueryChatMessage[],
  output: string,
  options?: { removeIfEmpty?: boolean },
): AiQueryChatMessage[] {
  const sql = output.trim()
  if (sql) return upsertSqlInCurrentTurn(messages, sql)

  if (!options?.removeIfEmpty) return messages
  const sqlIndex = findAssistantIndexInCurrentTurn(messages, "sql")
  if (sqlIndex < 0) return messages
  return messages.filter((_, index) => index !== sqlIndex)
}
