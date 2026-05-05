import { useCallback, useState } from "react"
import { ApiError } from "@/lib/api-client"
import { explainNl2Sql, generateNl2Sql } from "./api"

export type AiQueryChatUserMessage = {
  role: "user"
  content: string
}

export type AiQueryChatSqlMessage = {
  role: "assistant"
  type: "sql"
  output: string
}

export type AiQueryChatExplanationMessage = {
  role: "assistant"
  type: "explanation"
  output: string
  /** Prompt string sent as nl2sql `style` / `explanationStyle`. */
  style: string
  sql: string
}

export type AiQueryChatAssistantMessage =
  | AiQueryChatSqlMessage
  | AiQueryChatExplanationMessage

export type AiQueryChatMessage = AiQueryChatUserMessage | AiQueryChatAssistantMessage

/** Natural-language explain: `message` is SQL to explain. */
export type AiQueryChatExplainPayload = {
  type: "explain"
  message: string
  style?: string
}

/** NL→SQL: `message` is the question; optional schema/dialect for `/generate`. */
export type AiQueryChatGeneratePayload = {
  type: "generate"
  message: string
  /** Passed to `/generate` as `explanationStyle` (same semantics as `/explain` `style`). */
  style?: string
  schema?: string
  dialect?: string
}

export type AiQueryChatSendPayload = AiQueryChatExplainPayload | AiQueryChatGeneratePayload

export function lastExplanationStyle(messages: AiQueryChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === "assistant" && m.type === "explanation") return m.style
  }
  return ""
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export function useAiQueryChat() {
  const [messages, setMessages] = useState<AiQueryChatMessage[]>([])
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => setError(null), [])

  const reset = useCallback(() => {
    setMessages([])
    setError(null)
    setIsPending(false)
  }, [])

  const sendMessage = useCallback(async (payload: AiQueryChatSendPayload) => {
    const trimmed = payload.message.trim()
    if (!trimmed) return

    setError(null)
    setIsPending(true)
    setMessages((prev) => [...prev, { role: "user", content: trimmed }])

    try {
      if (payload.type === "explain") {
        const style = payload.style ?? ""
        const res = await explainNl2Sql({ sql: trimmed, style })
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            type: "explanation",
            output: res.explanation,
            style,
            sql: trimmed,
          },
        ])
      } else {
        const explanationStyle = (payload.style ?? "").trim()
        const res = await generateNl2Sql({
          question: trimmed,
          schema: payload.schema ?? "",
          dialect: payload.dialect ?? "postgresql",
          explanationStyle,
        })
        setMessages((prev) => [
          ...prev,
          { role: "assistant", type: "sql", output: res.sql },
          {
            role: "assistant",
            type: "explanation",
            output: res.explanation ?? "",
            style: explanationStyle,
            sql: res.sql,
          },
        ])
      }
    } catch (e) {
      setError(errorMessage(e, "Request failed"))
    } finally {
      setIsPending(false)
    }
  }, [])

  const refreshExplanationAt = useCallback(
    async (index: number, stylePrompt: string) => {
      const msg = messages[index]
      if (!msg || msg.role !== "assistant" || msg.type !== "explanation") return

      setError(null)
      setIsPending(true)
      try {
        const res = await explainNl2Sql({ sql: msg.sql, style: stylePrompt })
        setMessages((prev) => {
          const next = [...prev]
          const cur = next[index]
          if (!cur || cur.role !== "assistant" || cur.type !== "explanation") return prev
          next[index] = {
            ...cur,
            output: res.explanation,
            style: stylePrompt,
          }
          return next
        })
      } catch (e) {
        setError(errorMessage(e, "Request failed"))
      } finally {
        setIsPending(false)
      }
    },
    [messages],
  )

  return {
    messages,
    isPending,
    error,
    sendMessage,
    refreshExplanationAt,
    reset,
    clearError,
  }
}
