import { useCallback, useState } from "react"
import { ApiError } from "@/lib/api-client"
import { explainSqlWithOpenAi, fixSqlWithOpenAi, generateSqlWithOpenAi } from "./api"
import { EXPLAIN_STYLE_NONE_SENTINEL, explainStylePrompt } from "./explain-styles"

const DEFAULT_LAST_GENERATE_STYLE = explainStylePrompt("none")

export type AiQueryChatUserTextMessage = {
  role: "user"
  variant: "text"
  content: string
}

export type AiQueryChatUserFixMessage = {
  role: "user"
  variant: "fix"
  sql: string
  errorMessage: string
}

export type AiQueryChatUserMessage = AiQueryChatUserTextMessage | AiQueryChatUserFixMessage

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
  /**
   * True when this block is the explanation paired with NL→SQL output (including after restyling).
   */
  fromGenerate?: boolean
  /** True after the user picked a new style via the explanation dropdown (explain refresh). */
  explanationRestyled?: boolean
}

export type AiQueryChatFixMessage = {
  role: "assistant"
  type: "fix"
  explanation: string
  fixedSql: string
}

export type AiQueryChatAssistantMessage =
  | AiQueryChatSqlMessage
  | AiQueryChatExplanationMessage
  | AiQueryChatFixMessage

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

/** SQL repair: requires failing SQL and the database error text for `/fix`. */
export type AiQueryChatFixPayload = {
  type: "fix"
  sql: string
  errorMessage: string
  schema?: string
  dialect?: string
}

export type AiQueryChatSendPayload =
  | AiQueryChatExplainPayload
  | AiQueryChatGeneratePayload
  | AiQueryChatFixPayload

export function lastExplanationStyle(messages: AiQueryChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== "assistant" || m.type !== "explanation") continue
    if (m.fromGenerate && !m.explanationRestyled) continue
    return m.style
  }
  return ""
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export type UseAiQueryChatOptions = {
  /** Default schema snapshot for `/explain` and explanation refresh (e.g. live introspection text). */
  schema?: string
  dialect?: string
  openaiUrl?: string
  openaiKey?: string
}

export function useAiQueryChat(opts?: UseAiQueryChatOptions) {
  const schema = opts?.schema ?? ""
  const dialect = opts?.dialect ?? "postgresql"
  const openaiUrl = opts?.openaiUrl?.trim() ?? ""
  const openaiKey = opts?.openaiKey?.trim() ?? ""

  const [messages, setMessages] = useState<AiQueryChatMessage[]>([])
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastGenerateStyle, setLastGenerateStyle] = useState(DEFAULT_LAST_GENERATE_STYLE)

  const clearError = useCallback(() => setError(null), [])

  const assertOpenAiConfig = useCallback(() => {
    if (!openaiUrl || !openaiKey) {
      throw new Error("AI assistant is not configured: missing openaiurl/openaikey")
    }
    return { openaiUrl, openaiKey }
  }, [openaiUrl, openaiKey])

  const generateExplanationForSql = useCallback(async (args: { sql: string; style: string }) => {
    if (args.style.trim() === EXPLAIN_STYLE_NONE_SENTINEL) {
      return ""
    }

    const { openaiUrl: url, openaiKey: key } = assertOpenAiConfig()
    const res = await explainSqlWithOpenAi({
      openaiUrl: url,
      openaiKey: key,
      sql: args.sql,
      style: args.style,
      schema,
      dialect,
    })
    return res.explanation
  }, [assertOpenAiConfig, schema, dialect])

  const reset = useCallback(() => {
    setMessages([])
    setError(null)
    setIsPending(false)
    setLastGenerateStyle(DEFAULT_LAST_GENERATE_STYLE)
  }, [])

  const sendMessage = useCallback(async (payload: AiQueryChatSendPayload) => {
    if (payload.type === "fix") {
      const sqlTrim = payload.sql.trim()
      const errTrim = payload.errorMessage.trim()
      if (!sqlTrim || !errTrim) return

      setError(null)
      setIsPending(true)
      setMessages((prev) => [
        ...prev,
        { role: "user", variant: "fix", sql: sqlTrim, errorMessage: errTrim },
      ])

      try {
        const { openaiUrl: url, openaiKey: key } = assertOpenAiConfig()
        const res = await fixSqlWithOpenAi({
          openaiUrl: url,
          openaiKey: key,
          sql: sqlTrim,
          errorMessage: errTrim,
          schema: payload.schema ?? schema,
          dialect: payload.dialect ?? dialect,
        })
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            type: "fix",
            explanation: res.explanation,
            fixedSql: res.fixedSql,
          },
        ])
      } catch (e) {
        setError(errorMessage(e, "Request failed"))
      } finally {
        setIsPending(false)
      }
      return
    }

    const trimmed = payload.message.trim()
    if (!trimmed) return

    setError(null)
    setIsPending(true)
    setMessages((prev) => [...prev, { role: "user", variant: "text", content: trimmed }])

    try {
      if (payload.type === "explain") {
        const style = payload.style ?? ""
        const { openaiUrl: url, openaiKey: key } = assertOpenAiConfig()
        const res =
          style.trim() === EXPLAIN_STYLE_NONE_SENTINEL
            ? { explanation: "" }
            : await explainSqlWithOpenAi({
                openaiUrl: url,
                openaiKey: key,
                sql: trimmed,
                style,
                schema,
                dialect,
              })
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            type: "explanation",
            output: res.explanation,
            style,
            sql: trimmed,
            fromGenerate: false,
          },
        ])
      } else {
        const explanationStyle = (payload.style ?? "").trim()
        const { openaiUrl: url, openaiKey: key } = assertOpenAiConfig()
        const sqlRes = await generateSqlWithOpenAi({
          openaiUrl: url,
          openaiKey: key,
          humanQuery: trimmed,
          schema: payload.schema ?? schema,
        })
        const explanation = await generateExplanationForSql({
          sql: sqlRes.sql,
          style: explanationStyle,
        })
        setMessages((prev) => [
          ...prev,
          { role: "assistant", type: "sql", output: sqlRes.sql },
          {
            role: "assistant",
            type: "explanation",
            output: explanation,
            style: explanationStyle,
            sql: sqlRes.sql,
            fromGenerate: true,
          },
        ])
        setLastGenerateStyle(explanationStyle)
      }
    } catch (e) {
      setError(errorMessage(e, "Request failed"))
    } finally {
      setIsPending(false)
    }
  }, [schema, dialect, assertOpenAiConfig, generateExplanationForSql])

  const refreshExplanationAt = useCallback(
    async (index: number, stylePrompt: string) => {
      const msg = messages[index]
      if (!msg || msg.role !== "assistant" || msg.type !== "explanation") return

      setError(null)
      setIsPending(true)
      try {
        const trimmedStyle = stylePrompt.trim()
        const { openaiUrl: url, openaiKey: key } = assertOpenAiConfig()
        const res =
          trimmedStyle === EXPLAIN_STYLE_NONE_SENTINEL
            ? { explanation: "" }
            : await explainSqlWithOpenAi({
                openaiUrl: url,
                openaiKey: key,
                sql: msg.sql,
                style: trimmedStyle,
                schema,
                dialect,
              })
        setMessages((prev) => {
          const next = [...prev]
          const cur = next[index]
          if (!cur || cur.role !== "assistant" || cur.type !== "explanation") return prev
          next[index] = {
            ...cur,
            output: res.explanation,
            style: trimmedStyle,
            explanationRestyled: true,
          }
          return next
        })
        setLastGenerateStyle(trimmedStyle)
      } catch (e) {
        setError(errorMessage(e, "Request failed"))
      } finally {
        setIsPending(false)
      }
    },
    [messages, schema, dialect, assertOpenAiConfig],
  )

  return {
    messages,
    isPending,
    error,
    lastGenerateStyle,
    sendMessage,
    refreshExplanationAt,
    reset,
    clearError,
  }
}
