import { useCallback, useRef, useState } from "react"
import {
  fixSqlWithOpenAiStream,
  generateSqlWithOpenAiStream,
  type OpenAiRequestUsage,
} from "./api"
import {
  errorMessage,
  finalizeSqlInCurrentTurn,
  isAbortError,
  pruneEmptyAssistantMessages,
  upsertFixExplanationInCurrentTurn,
  upsertSqlInCurrentTurn,
  upsertThinkingInCurrentTurn,
} from "./use-ai-query-chat.utils"

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

type AiQueryChatUserMessage = AiQueryChatUserTextMessage | AiQueryChatUserFixMessage

export type AiQueryChatSqlMessage = {
  role: "assistant"
  type: "sql"
  output: string
  usage?: OpenAiRequestUsage
}

export type AiQueryChatFixMessage = {
  role: "assistant"
  type: "fix"
  explanation: string
  usage?: OpenAiRequestUsage
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

type AiQueryChatAssistantMessage =
  | AiQueryChatSqlMessage
  | AiQueryChatFixMessage
  | AiQueryChatErrorMessage
  | AiQueryChatThinkingMessage

export type AiQueryChatMessage = AiQueryChatUserMessage | AiQueryChatAssistantMessage

/** NL→SQL: `message` is the question; optional schema/dialect for `/generate`. */
type AiQueryChatGeneratePayload = {
  type: "generate"
  message: string
  schema?: string
  dialect?: string
}

/** SQL repair: requires failing SQL and the database error text for `/fix`. */
type AiQueryChatFixPayload = {
  type: "fix"
  sql: string
  errorMessage: string
  schema?: string
  dialect?: string
}

export type AiQueryChatSendPayload =
  | AiQueryChatGeneratePayload
  | AiQueryChatFixPayload

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
  const fixPhaseRef = useRef<"explanation" | "sql">("explanation")

  const beginRequest = useCallback(() => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    fixPhaseRef.current = "explanation"
    setIsPending(true)
    return controller
  }, [])

  const finishRequest = useCallback((controller: AbortController) => {
    if (abortControllerRef.current === controller) {
      abortControllerRef.current = null
    }
    fixPhaseRef.current = "explanation"
    setIsPending(false)
    setMessages((prev) => {
      const next = pruneEmptyAssistantMessages(prev)
      return next.length === prev.length ? prev : next
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
    fixPhaseRef.current = "explanation"
    setMessages([])
    setIsPending(false)
  }, [])

  const appendErrorMessage = useCallback((error: unknown) => {
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        type: "error",
        output: errorMessage(error, "Request failed"),
      },
    ])
  }, [])

  const runRequest = useCallback(
    async (request: (controller: AbortController) => Promise<void>) => {
      const controller = beginRequest()
      try {
        await request(controller)
      } catch (error) {
        if (!isAbortError(error, controller.signal)) {
          appendErrorMessage(error)
        }
      } finally {
        finishRequest(controller)
      }
    },
    [appendErrorMessage, beginRequest, finishRequest],
  )

  const sendMessage = useCallback(async (payload: AiQueryChatSendPayload) => {
    if (payload.type === "fix") {
      const sqlTrim = payload.sql.trim()
      const errTrim = payload.errorMessage.trim()
      if (!sqlTrim || !errTrim) return

      await runRequest(async (controller) => {
        const { openaiUrl: url, openaiKey: key } = assertOpenAiConfig()
        setMessages((prev) => [
          ...prev,
          { role: "user", variant: "fix", sql: sqlTrim, errorMessage: errTrim },
          { role: "assistant", type: "thinking", output: "" },
          { role: "assistant", type: "fix", explanation: "" },
          { role: "assistant", type: "thinking", output: "" },
          { role: "assistant", type: "sql", output: "" },
        ])

        const { signal } = controller
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
            setMessages((prev) => upsertFixExplanationInCurrentTurn(prev, text))
          },
          onSqlPhaseStart: () => {
            fixPhaseRef.current = "sql"
          },
          onSqlText: (text) => {
            setMessages((prev) => upsertSqlInCurrentTurn(prev, text))
          },
          onReasoningText: (text) => {
            const occurrence = fixPhaseRef.current === "sql" ? 2 : 1
            setMessages((prev) => upsertThinkingInCurrentTurn(prev, text, occurrence))
          },
        })
        if (signal.aborted) return
        setMessages((prev) => {
          const withExplanation = upsertFixExplanationInCurrentTurn(prev, res.explanation, {
            usage: res.explanationUsage,
          })
          return finalizeSqlInCurrentTurn(withExplanation, res.fixedSql, {
            usage: res.fixedSqlUsage,
          })
        })
      })
      return
    }

    const trimmed = payload.message.trim()
    if (!trimmed) return

    await runRequest(async (controller) => {
      const { openaiUrl: url, openaiKey: key } = assertOpenAiConfig()
      const generationSchema = payload.schema ?? schema
      setMessages((prev) => [...prev, { role: "user", variant: "text", content: trimmed }])

      const { signal } = controller
      const sqlRes = await generateSqlWithOpenAiStream({
        openaiUrl: url,
        openaiKey: key,
        model: selectedModel || undefined,
        humanQuery: trimmed,
        schema: generationSchema,
        signal,
        onText: (text) => {
          setMessages((prev) => upsertSqlInCurrentTurn(prev, text))
        },
        onReasoningText: (text) => {
          setMessages((prev) => upsertThinkingInCurrentTurn(prev, text))
        },
      })
      if (signal.aborted) return
      setMessages((prev) =>
        finalizeSqlInCurrentTurn(prev, sqlRes.sql, {
          removeIfEmpty: true,
          usage: sqlRes.usage,
        }),
      )
    })
  }, [schema, dialect, assertOpenAiConfig, runRequest, selectedModel])

  return {
    messages,
    isPending,
    sendMessage,
    stop,
    reset,
  }
}
