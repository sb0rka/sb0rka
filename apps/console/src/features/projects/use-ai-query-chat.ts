import { useCallback, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { ApiError } from "@/lib/api-client"
import {
  explainSqlWithOpenAiStream,
  fixSqlWithOpenAiStream,
  generateSqlWithOpenAiStream,
  resolveOptimalSql,
  reviewSqlCorrectness,
  reviewSqlOptimality,
} from "./api"
import { EXPLAIN_STYLE_NONE_SENTINEL, explainStylePrompt } from "./explain-styles"

const DEFAULT_LAST_GENERATE_STYLE = explainStylePrompt("none")

export type AiReasoningLevel = "low" | "medium" | "high"

type AiReasoningPolicy = {
  maxCorrectnessPasses: number
  runFurtherSteps: boolean
}

function resolveReasoningPolicy(level: AiReasoningLevel): AiReasoningPolicy {
  switch (level) {
    case "low":
      return { maxCorrectnessPasses: 0, runFurtherSteps: false }
    case "medium":
      return { maxCorrectnessPasses: 2, runFurtherSteps: false }
    case "high":
      return { maxCorrectnessPasses: 3, runFurtherSteps: true }
    default: {
      const _x: never = level
      return _x
    }
  }
}

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
  | AiQueryChatExplanationMessage
  | AiQueryChatFixMessage
  | AiQueryChatErrorMessage
  | AiQueryChatThinkingMessage

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

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (error instanceof DOMException && error.name === "AbortError") return true
  if (error instanceof Error && error.name === "AbortError") return true
  return false
}

export type UseAiQueryChatOptions = {
  /** Default schema snapshot for `/explain` and explanation refresh (e.g. live introspection text). */
  schema?: string
  dialect?: string
  openaiUrl?: string
  openaiKey?: string
  selectedModel?: string
  reasoningLevel?: AiReasoningLevel
}

export function useAiQueryChat(opts?: UseAiQueryChatOptions) {
  const schema = opts?.schema ?? ""
  const dialect = opts?.dialect ?? "postgresql"
  const openaiUrl = opts?.openaiUrl?.trim() ?? ""
  const openaiKey = opts?.openaiKey?.trim() ?? ""
  const selectedModel = opts?.selectedModel?.trim() ?? ""
  const reasoningLevel = opts?.reasoningLevel ?? "low"
  const reasoningPolicy = resolveReasoningPolicy(reasoningLevel)

  const [messages, setMessages] = useState<AiQueryChatMessage[]>([])
  const [isPending, setIsPending] = useState(false)
  const [lastGenerateStyle, setLastGenerateStyleState] = useState(DEFAULT_LAST_GENERATE_STYLE)
  const abortControllerRef = useRef<AbortController | null>(null)
  const thinkingMessageIndexRef = useRef(-1)
  const sqlMessageIndexRef = useRef(-1)
  const fixSqlMessageIndexRef = useRef(-1)
  const fixMessageIndexRef = useRef(-1)

  const setLastGenerateStyle = useCallback((style: string) => {
    setLastGenerateStyleState(style)
  }, [])

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

  const updateAssistantMessageAt = useCallback(
    (
      index: number,
      updater: (message: AiQueryChatAssistantMessage) => AiQueryChatAssistantMessage,
    ) => {
      if (index < 0) return
      setMessages((prev) => {
        const current = prev[index]
        if (!current || current.role !== "assistant") return prev
        const next = [...prev]
        next[index] = updater(current)
        return next
      })
    },
    [],
  )

  const assertOpenAiConfig = useCallback(() => {
    if (!openaiUrl || !openaiKey) {
      throw new Error("AI assistant is not configured: missing openaiurl/openaikey")
    }
    return { openaiUrl, openaiKey }
  }, [openaiUrl, openaiKey])

  const generateExplanationForSql = useCallback(async (args: {
    sql: string
    style: string
    signal?: AbortSignal
    onText?: (text: string) => void
    onReasoningText?: (text: string) => void
  }) => {
    if (args.style.trim() === EXPLAIN_STYLE_NONE_SENTINEL) {
      args.onText?.("")
      return ""
    }

    const { openaiUrl: url, openaiKey: key } = assertOpenAiConfig()
    const res = await explainSqlWithOpenAiStream({
      openaiUrl: url,
      openaiKey: key,
      model: selectedModel || undefined,
      sql: args.sql,
      style: args.style,
      schema,
      dialect,
      signal: args.signal,
      onText: args.onText,
      onReasoningText: args.onReasoningText,
    })
    return res.explanation
  }, [assertOpenAiConfig, selectedModel, schema, dialect])

  const reset = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    thinkingMessageIndexRef.current = -1
    sqlMessageIndexRef.current = -1
    fixSqlMessageIndexRef.current = -1
    fixMessageIndexRef.current = -1
    setMessages([])
    setIsPending(false)
    setLastGenerateStyleState(DEFAULT_LAST_GENERATE_STYLE)
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
      if (payload.type === "explain") {
        const style = payload.style ?? ""
        let explanationMessageIndex = -1
        setMessages((prev) => {
          const thinkingIndex = prev.length + 1
          explanationMessageIndex = thinkingIndex + 1
          thinkingMessageIndexRef.current = thinkingIndex
          return [
            ...prev,
            { role: "user", variant: "text", content: trimmed },
            { role: "assistant", type: "thinking", output: "" },
            {
              role: "assistant",
              type: "explanation",
              output: "",
              style,
              sql: trimmed,
              fromGenerate: false,
            },
          ]
        })
        const { openaiUrl: url, openaiKey: key } = assertOpenAiConfig()
        const res =
          style.trim() === EXPLAIN_STYLE_NONE_SENTINEL
            ? { explanation: "" }
            : await explainSqlWithOpenAiStream({
                openaiUrl: url,
                openaiKey: key,
                model: selectedModel || undefined,
                sql: trimmed,
                style,
                schema,
                dialect,
                signal,
                onText: (text) => {
                  updateAssistantMessageAt(explanationMessageIndex, (message) => {
                    if (message.type !== "explanation") return message
                    return { ...message, output: text }
                  })
                },
                onReasoningText: upsertThinkingText,
              })
        if (signal.aborted) return
        updateAssistantMessageAt(explanationMessageIndex, (message) => {
          if (message.type !== "explanation") return message
          return {
            ...message,
            output: res.explanation,
            style,
            sql: trimmed,
            fromGenerate: false,
          }
        })
      } else {
        const explanationStyle = (payload.style ?? "").trim()
        const { openaiUrl: url, openaiKey: key } = assertOpenAiConfig()
        const generationSchema = payload.schema ?? schema
        const generationDialect = payload.dialect ?? dialect
        let explanationMessageIndex = -1
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
        let currentSql = sqlRes.sql.trim()
        let isSqlMarkedCorrect = false
        const reviewNotices: string[] = []

        if (reasoningPolicy.maxCorrectnessPasses > 0) {
          for (let attempt = 0; attempt < reasoningPolicy.maxCorrectnessPasses; attempt++) {
            if (signal.aborted) return
            let review
            try {
              review = await reviewSqlCorrectness({
                openaiUrl: url,
                openaiKey: key,
                model: selectedModel || undefined,
                schema: generationSchema,
                dialect: generationDialect,
                humanQuery: trimmed,
                sql: currentSql,
                signal,
              })
            } catch (e) {
              if (isAbortError(e, signal)) return
              reviewNotices.push("AI correctness review failed. Using latest SQL candidate.")
              break
            }

            if (review.status === "correct") {
              isSqlMarkedCorrect = true
              reviewNotices.push("AI correctness review passed. Using latest SQL candidate.")
              break
            }

            if (!review.sql) {
              reviewNotices.push("AI review returned `rewrite` without SQL. Using latest SQL candidate.")
              break
            }
            currentSql = review.sql
          }

          if (!isSqlMarkedCorrect) {
            reviewNotices.push(
              `AI could not confirm correctness within ${reasoningPolicy.maxCorrectnessPasses} passes. Review before running.`,
            )
          }
        }
        let finalSql = currentSql
        if (reasoningPolicy.runFurtherSteps) {
          if (signal.aborted) return
          try {
            const optimalityReview = await reviewSqlOptimality({
              openaiUrl: url,
              openaiKey: key,
              model: selectedModel || undefined,
              schema: generationSchema,
              dialect: generationDialect,
              humanQuery: trimmed,
              sql: currentSql,
              signal,
            })

            if (optimalityReview.status === "alternative" && optimalityReview.sql) {
              if (signal.aborted) return
              try {
                const resolved = await resolveOptimalSql({
                  openaiUrl: url,
                  openaiKey: key,
                  model: selectedModel || undefined,
                  schema: generationSchema,
                  dialect: generationDialect,
                  humanQuery: trimmed,
                  correctSql: currentSql,
                  alternativeSql: optimalityReview.sql,
                  signal,
                })
                finalSql = resolved.sql
              } catch (e) {
                if (isAbortError(e, signal)) return
                finalSql = optimalityReview.sql
                reviewNotices.push("AI optimality resolution failed. Using alternative SQL candidate.")
              }
            }
          } catch (e) {
            if (isAbortError(e, signal)) return
            reviewNotices.push("AI optimality review failed. Using current SQL candidate.")
          }
        }

        if (signal.aborted) return
        const sqlToRender = finalSql.trim() || sqlRes.sql.trim()
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

          const explanationThinkingIndex = next.length
          next.push({ role: "assistant", type: "thinking", output: "" })
          thinkingMessageIndexRef.current = explanationThinkingIndex
          explanationMessageIndex = next.length
          next.push({
            role: "assistant",
            type: "explanation",
            output: "",
            style: explanationStyle,
            sql: sqlToRender,
            fromGenerate: true,
          })
          return next
        })

        const explanation = await generateExplanationForSql({
          sql: sqlToRender,
          style: explanationStyle,
          signal,
          onText: (text) => {
            updateAssistantMessageAt(explanationMessageIndex, (message) => {
              if (message.type !== "explanation") return message
              return { ...message, output: text, style: explanationStyle, sql: sqlToRender }
            })
          },
          onReasoningText: upsertThinkingText,
        })
        if (signal.aborted) return

        updateAssistantMessageAt(explanationMessageIndex, (message) => {
          if (message.type !== "explanation") return message
          return {
            ...message,
            output: explanation,
            style: explanationStyle,
            sql: sqlToRender,
            fromGenerate: true,
          }
        })
        setLastGenerateStyleState(explanationStyle)
      }
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
  }, [schema, dialect, assertOpenAiConfig, beginRequest, finishRequest, findFixSqlMessageIndex, generateExplanationForSql, selectedModel, reasoningPolicy.maxCorrectnessPasses, reasoningPolicy.runFurtherSteps, updateAssistantMessageAt, upsertFixMessage, upsertStreamingSql, upsertThinkingText])

  const refreshExplanationAt = useCallback(
    async (index: number, stylePrompt: string) => {
      const msg = messages[index]
      if (!msg || msg.role !== "assistant" || msg.type !== "explanation") return

      const controller = beginRequest()
      const { signal } = controller
      let explanationMessageIndex = index
      setMessages((prev) => {
        const next = [...prev]
        next.splice(index, 0, { role: "assistant", type: "thinking", output: "" })
        thinkingMessageIndexRef.current = index
        explanationMessageIndex = index + 1
        return next
      })
      try {
        const trimmedStyle = stylePrompt.trim()
        const { openaiUrl: url, openaiKey: key } = assertOpenAiConfig()
        const res =
          trimmedStyle === EXPLAIN_STYLE_NONE_SENTINEL
            ? { explanation: "" }
            : await explainSqlWithOpenAiStream({
                openaiUrl: url,
                openaiKey: key,
                model: selectedModel || undefined,
                sql: msg.sql,
                style: trimmedStyle,
                schema,
                dialect,
                signal,
                onText: (text) => {
                  updateAssistantMessageAt(explanationMessageIndex, (message) => {
                    if (message.type !== "explanation") return message
                    return {
                      ...message,
                      output: text,
                      style: trimmedStyle,
                      explanationRestyled: true,
                    }
                  })
                },
                onReasoningText: upsertThinkingText,
              })
        if (signal.aborted) return
        setMessages((prev) => {
          const next = [...prev]
          const cur = next[explanationMessageIndex]
          if (!cur || cur.role !== "assistant" || cur.type !== "explanation") return prev
          next[explanationMessageIndex] = {
            ...cur,
            output: res.explanation,
            style: trimmedStyle,
            explanationRestyled: true,
          }
          return next
        })
        setLastGenerateStyleState(trimmedStyle)
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
    },
    [messages, schema, dialect, assertOpenAiConfig, beginRequest, finishRequest, selectedModel, updateAssistantMessageAt, upsertThinkingText],
  )

  return {
    messages,
    isPending,
    lastGenerateStyle,
    setLastGenerateStyle,
    sendMessage,
    refreshExplanationAt,
    stop,
    reset,
  }
}
