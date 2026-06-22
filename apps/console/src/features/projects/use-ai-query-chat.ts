import { useCallback, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { ApiError } from "@/lib/api-client"
import {
  fixSqlWithOpenAiStream,
  generateSqlWithOpenAiStream,
} from "./api"

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

export type AiQueryChatFixMessage = {
  role: "assistant"
  type: "fix"
  explanation: string
  fixedSql: string
}

export type AiQueryChatErrorMessage = {
  role: "assistant"
  type: "error"
  output: string
}

export type AiQueryChatThinkingMessage = {
  role: "assistant"
  type: "thinking"
  output: string
}

export type AiQueryChatAssistantMessage =
  | AiQueryChatSqlMessage
  | AiQueryChatFixMessage
  | AiQueryChatErrorMessage
  | AiQueryChatThinkingMessage

export type AiQueryChatMessage = AiQueryChatUserMessage | AiQueryChatAssistantMessage

/** NL→SQL: `message` is the question; optional schema/dialect for `/generate`. */
export type AiQueryChatGeneratePayload = {
  type: "generate"
  message: string
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
  | AiQueryChatGeneratePayload
  | AiQueryChatFixPayload

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (error instanceof DOMException && error.name === "AbortError") return true
  if (error instanceof Error && error.name === "AbortError") return true
  return false
}

export type UseAiQueryChatOptions = {
  /** Default schema snapshot for NL→SQL and SQL fix requests. */
  schema?: string
  dialect?: string
  openaiUrl?: string
  openaiKey?: string
  selectedModel?: string
}

export function useAiQueryChat(opts?: UseAiQueryChatOptions) {
  const schema = opts?.schema ?? ""
  const dialect = opts?.dialect ?? "postgresql"
  const openaiUrl = opts?.openaiUrl?.trim() ?? ""
  const openaiKey = opts?.openaiKey?.trim() ?? ""
  const selectedModel = opts?.selectedModel?.trim() ?? ""

  const [messages, setMessages] = useState<AiQueryChatMessage[]>([])
  const [isPending, setIsPending] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const thinkingMessageIndexRef = useRef(-1)
  const sqlMessageIndexRef = useRef(-1)
  const fixSqlMessageIndexRef = useRef(-1)
  const fixMessageIndexRef = useRef(-1)

  const beginRequest = useCallback(() => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    thinkingMessageIndexRef.current = -1
    sqlMessageIndexRef.current = -1
    fixSqlMessageIndexRef.current = -1
    fixMessageIndexRef.current = -1
    setIsPending(true)
    return controller
  }, [])

  const finishRequest = useCallback((controller: AbortController) => {
    if (abortControllerRef.current === controller) {
      abortControllerRef.current = null
    }
    setIsPending(false)
    setMessages((prev) => {
      const next = prev.filter((m) => {
        if (m.role !== "assistant") return true
        if (m.type === "thinking" || m.type === "sql") return m.output.trim().length > 0
        if (m.type === "fix") {
          return m.explanation.trim().length > 0
        }
        return true
      })
      thinkingMessageIndexRef.current = -1
      sqlMessageIndexRef.current = -1
      fixSqlMessageIndexRef.current = -1
      fixMessageIndexRef.current = -1
      return next.length === prev.length ? prev : next
    })
  }, [])

  const upsertFixMessage = useCallback((patch: { explanation?: string; fixedSql?: string }) => {
    const hasContent =
      (patch.explanation?.trim() ?? "").length > 0 || (patch.fixedSql?.trim() ?? "").length > 0
    if (!hasContent) return

    setMessages((prev) => {
      const fixIndex = fixMessageIndexRef.current
      if (
        fixIndex >= 0 &&
        fixIndex < prev.length &&
        prev[fixIndex]?.role === "assistant" &&
        prev[fixIndex]?.type === "fix"
      ) {
        const next = [...prev]
        const current = next[fixIndex]
        if (current.role !== "assistant" || current.type !== "fix") return prev
        next[fixIndex] = {
          ...current,
          ...(patch.explanation !== undefined ? { explanation: patch.explanation } : {}),
          ...(patch.fixedSql !== undefined ? { fixedSql: patch.fixedSql } : {}),
        }
        return next
      }
      fixMessageIndexRef.current = prev.length
      return [
        ...prev,
        {
          role: "assistant",
          type: "fix",
          explanation: patch.explanation ?? "",
          fixedSql: patch.fixedSql ?? "",
        },
      ]
    })
  }, [])

  const findFixSqlMessageIndex = useCallback((prev: AiQueryChatMessage[]) => {
    const fixIndex = fixMessageIndexRef.current
    if (fixIndex < 0) return -1
    for (let i = fixIndex + 1; i < prev.length; i++) {
      const m = prev[i]
      if (m.role === "assistant" && m.type === "sql") return i
      if (m.role === "user") break
    }
    return -1
  }, [])

  const upsertStreamingSql = useCallback((text: string) => {
    if (!text.trim()) return
    setMessages((prev) => {
      const useFixSqlSlot = fixSqlMessageIndexRef.current >= 0
      let sqlIndex = useFixSqlSlot
        ? fixSqlMessageIndexRef.current
        : sqlMessageIndexRef.current

      const isSqlMessage = (index: number) =>
        index >= 0 &&
        index < prev.length &&
        prev[index]?.role === "assistant" &&
        prev[index]?.type === "sql"

      if (!isSqlMessage(sqlIndex) && useFixSqlSlot) {
        const scanned = findFixSqlMessageIndex(prev)
        if (scanned >= 0) {
          sqlIndex = scanned
          fixSqlMessageIndexRef.current = scanned
        }
      }

      if (isSqlMessage(sqlIndex)) {
        const next = [...prev]
        next[sqlIndex] = { role: "assistant", type: "sql", output: text }
        return next
      }

      if (useFixSqlSlot) return prev

      const appendIndex = prev.length
      sqlMessageIndexRef.current = appendIndex
      return [...prev, { role: "assistant", type: "sql", output: text }]
    })
  }, [findFixSqlMessageIndex])

  const upsertThinkingText = useCallback((text: string) => {
    setMessages((prev) => {
      const thinkingIndex = thinkingMessageIndexRef.current
      if (
        thinkingIndex >= 0 &&
        thinkingIndex < prev.length &&
        prev[thinkingIndex]?.role === "assistant" &&
        prev[thinkingIndex]?.type === "thinking"
      ) {
        const next = [...prev]
        next[thinkingIndex] = { role: "assistant", type: "thinking", output: text }
        return next
      }
      thinkingMessageIndexRef.current = prev.length
      return [...prev, { role: "assistant", type: "thinking", output: text }]
    })
  }, [])

  const stop = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsPending(false)
  }, [])

  const assertOpenAiConfig = useCallback(() => {
    if (!openaiUrl || !openaiKey) {
      throw new Error("AI assistant is not configured: missing LLM_BASE_URL/LLM_API_KEY")
    }
    return { openaiUrl, openaiKey }
  }, [openaiUrl, openaiKey])

  const reset = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    thinkingMessageIndexRef.current = -1
    sqlMessageIndexRef.current = -1
    fixSqlMessageIndexRef.current = -1
    fixMessageIndexRef.current = -1
    setMessages([])
    setIsPending(false)
  }, [])

  const sendMessage = useCallback(async (payload: AiQueryChatSendPayload) => {
    if (payload.type === "fix") {
      const sqlTrim = payload.sql.trim()
      const errTrim = payload.errorMessage.trim()
      if (!sqlTrim || !errTrim) return

      const controller = beginRequest()
      const { signal } = controller
      setMessages((prev) => {
        const thinkingIndex = prev.length + 1
        const fixIndex = thinkingIndex + 1
        thinkingMessageIndexRef.current = thinkingIndex
        fixMessageIndexRef.current = fixIndex
        return [
          ...prev,
          { role: "user", variant: "fix", sql: sqlTrim, errorMessage: errTrim },
          { role: "assistant", type: "thinking", output: "" },
          {
            role: "assistant",
            type: "fix",
            explanation: "",
            fixedSql: "",
          },
        ]
      })

      const beginFixSqlPhase = () => {
        thinkingMessageIndexRef.current = -1
        fixSqlMessageIndexRef.current = -1
        flushSync(() => {
          setMessages((prev) => {
            const fixIndex = fixMessageIndexRef.current
            const next = [...prev]
            const thinkingIndex = fixIndex >= 0 ? fixIndex + 1 : next.length
            next.splice(thinkingIndex, 0, { role: "assistant", type: "thinking", output: "" })
            thinkingMessageIndexRef.current = thinkingIndex
            const sqlIndex = thinkingIndex + 1
            next.splice(sqlIndex, 0, { role: "assistant", type: "sql", output: "" })
            fixSqlMessageIndexRef.current = sqlIndex
            return next
          })
        })
      }

      try {
        const { openaiUrl: url, openaiKey: key } = assertOpenAiConfig()
        const res = await fixSqlWithOpenAiStream({
          openaiUrl: url,
          openaiKey: key,
          model: selectedModel || undefined,
          sql: sqlTrim,
          errorMessage: errTrim,
          schema: payload.schema ?? schema,
          dialect: payload.dialect ?? dialect,
          signal,
          onExplanationText: (text) => {
            upsertFixMessage({ explanation: text })
          },
          onSqlPhaseStart: beginFixSqlPhase,
          onSqlText: upsertStreamingSql,
          onReasoningText: upsertThinkingText,
        })
        if (signal.aborted) return
        const fixedSql = res.fixedSql.trim()
        setMessages((prev) => {
          const next = [...prev]
          const fixIndex = fixMessageIndexRef.current
          if (
            fixIndex >= 0 &&
            fixIndex < next.length &&
            next[fixIndex]?.role === "assistant" &&
            next[fixIndex]?.type === "fix"
          ) {
            const current = next[fixIndex]
            if (current.role === "assistant" && current.type === "fix") {
              next[fixIndex] = { ...current, explanation: res.explanation }
            }
          }
          if (fixedSql) {
            let sqlIndex = fixSqlMessageIndexRef.current
            const sqlAtIndex =
              sqlIndex >= 0 && sqlIndex < next.length ? next[sqlIndex] : undefined
            const hasValidSqlSlot =
              sqlAtIndex?.role === "assistant" && sqlAtIndex.type === "sql"
            if (!hasValidSqlSlot) {
              sqlIndex = findFixSqlMessageIndex(next)
            }
            if (sqlIndex >= 0) {
              next[sqlIndex] = { role: "assistant", type: "sql", output: fixedSql }
            } else {
              fixSqlMessageIndexRef.current = next.length
              next.push({ role: "assistant", type: "sql", output: fixedSql })
            }
          }
          return next
        })
      } catch (e) {
        if (isAbortError(e, signal)) return
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            type: "error",
            output: errorMessage(e, "Request failed"),
          },
        ])
      } finally {
        finishRequest(controller)
      }
      return
    }

    const trimmed = payload.message.trim()
    if (!trimmed) return

    const controller = beginRequest()
    const { signal } = controller

    try {
      const { openaiUrl: url, openaiKey: key } = assertOpenAiConfig()
      const generationSchema = payload.schema ?? schema
      setMessages((prev) => [...prev, { role: "user", variant: "text", content: trimmed }])

      const sqlRes = await generateSqlWithOpenAiStream({
        openaiUrl: url,
        openaiKey: key,
        model: selectedModel || undefined,
        humanQuery: trimmed,
        schema: generationSchema,
        signal,
        onText: upsertStreamingSql,
        onReasoningText: upsertThinkingText,
      })
      if (signal.aborted) return
      const sqlToRender = sqlRes.sql.trim()
      setMessages((prev) => {
        let next = [...prev]
        const sqlIndex = sqlMessageIndexRef.current

        if (sqlToRender) {
          if (
            sqlIndex >= 0 &&
            sqlIndex < next.length &&
            next[sqlIndex]?.role === "assistant" &&
            next[sqlIndex]?.type === "sql"
          ) {
            next[sqlIndex] = { role: "assistant", type: "sql", output: sqlToRender }
          } else {
            next.push({ role: "assistant", type: "sql", output: sqlToRender })
            sqlMessageIndexRef.current = next.length - 1
          }
        } else if (sqlIndex >= 0) {
          next = next.filter((_, index) => index !== sqlIndex)
          sqlMessageIndexRef.current = -1
        }

        return next
      })
    } catch (e) {
      if (isAbortError(e, signal)) return
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          type: "error",
          output: errorMessage(e, "Request failed"),
        },
      ])
    } finally {
      finishRequest(controller)
    }
  }, [schema, dialect, assertOpenAiConfig, beginRequest, finishRequest, findFixSqlMessageIndex, selectedModel, upsertFixMessage, upsertStreamingSql, upsertThinkingText])

  return {
    messages,
    isPending,
    sendMessage,
    stop,
    reset,
  }
}
