import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAiQueryChat } from "./use-ai-query-chat"
import {
  fixSqlWithOpenAiStream,
  generateSqlWithOpenAiStream,
} from "./api"

vi.mock("./api", () => ({
  fixSqlWithOpenAiStream: vi.fn(),
  generateSqlWithOpenAiStream: vi.fn(),
}))

const generateSqlWithOpenAiStreamMock = vi.mocked(generateSqlWithOpenAiStream)
const fixSqlWithOpenAiStreamMock = vi.mocked(fixSqlWithOpenAiStream)

function createDeferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason?: unknown) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("useAiQueryChat", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("streams generate flow and finalizes SQL message", async () => {
    generateSqlWithOpenAiStreamMock.mockImplementation(async (data) => {
      data.onReasoningText?.("Analyzing schema")
      data.onText?.("SELECT")
      data.onText?.("SELECT 1")
      return { title: "One row", sql: "SELECT 1" }
    })

    const { result } = renderHook(() =>
      useAiQueryChat({ openaiUrl: "https://llm.example", openaiKey: "secret" }),
    )

    await act(async () => {
      await result.current.sendMessage({
        type: "generate",
        message: "show one row",
      })
    })

    expect(result.current.isPending).toBe(false)
    expect(result.current.messages).toEqual([
      { role: "user", variant: "text", content: "show one row" },
      { role: "assistant", type: "thinking", output: "Analyzing schema" },
      { role: "assistant", type: "sql", title: "One row", output: "SELECT 1" },
    ])
  })

  it("streams fix flow in two phases and keeps ordering stable", async () => {
    fixSqlWithOpenAiStreamMock.mockImplementation(async (data) => {
      data.onReasoningText?.("Inspecting database error")
      data.onExplanationText?.("The table alias is invalid.")
      data.onSqlPhaseStart?.()
      data.onReasoningText?.("Applying corrected alias")
      data.onSqlText?.("SELECT id FROM users")
      return {
        explanation: "The table alias is invalid.",
        fixedSql: "SELECT id FROM users",
      }
    })

    const { result } = renderHook(() =>
      useAiQueryChat({ openaiUrl: "https://llm.example", openaiKey: "secret" }),
    )

    await act(async () => {
      await result.current.sendMessage({
        type: "fix",
        sql: "SELECT id FROM userz",
        errorMessage: "relation userz does not exist",
      })
    })

    expect(result.current.isPending).toBe(false)
    expect(result.current.messages).toEqual([
      {
        role: "user",
        variant: "fix",
        sql: "SELECT id FROM userz",
        errorMessage: "relation userz does not exist",
      },
      { role: "assistant", type: "thinking", output: "Inspecting database error" },
      {
        role: "assistant",
        type: "fix",
        explanation: "The table alias is invalid.",
      },
      { role: "assistant", type: "thinking", output: "Applying corrected alias" },
      { role: "assistant", type: "sql", output: "SELECT id FROM users" },
    ])
  })

  it("stops a pending request without appending an error message", async () => {
    const deferred = createDeferred<{ title: string; sql: string }>()
    generateSqlWithOpenAiStreamMock.mockImplementation(async (data) => {
      data.signal?.addEventListener("abort", () => {
        deferred.reject(new DOMException("Aborted", "AbortError"))
      })
      return deferred.promise
    })

    const { result } = renderHook(() =>
      useAiQueryChat({ openaiUrl: "https://llm.example", openaiKey: "secret" }),
    )

    let sendPromise: Promise<void> | undefined
    act(() => {
      sendPromise = result.current.sendMessage({
        type: "generate",
        message: "select all",
      })
    })

    expect(result.current.isPending).toBe(true)

    await act(async () => {
      result.current.stop()
      await sendPromise
    })

    expect(result.current.isPending).toBe(false)
    expect(result.current.messages.filter((m) => m.role === "assistant" && m.type === "error")).toHaveLength(0)
  })

  it("reset aborts in-flight work and clears transcript", async () => {
    const deferred = createDeferred<{ title: string; sql: string }>()
    generateSqlWithOpenAiStreamMock.mockImplementation(async (data) => {
      data.signal?.addEventListener("abort", () => {
        deferred.reject(new DOMException("Aborted", "AbortError"))
      })
      return deferred.promise
    })

    const { result } = renderHook(() =>
      useAiQueryChat({ openaiUrl: "https://llm.example", openaiKey: "secret" }),
    )

    let sendPromise: Promise<void> | undefined
    act(() => {
      sendPromise = result.current.sendMessage({
        type: "generate",
        message: "still running",
      })
    })
    expect(result.current.isPending).toBe(true)

    await act(async () => {
      result.current.reset()
      await sendPromise
    })

    expect(result.current.isPending).toBe(false)
    expect(result.current.messages).toEqual([])
  })

  it("adds assistant error when AI config is missing", async () => {
    const { result } = renderHook(() => useAiQueryChat())

    await act(async () => {
      await result.current.sendMessage({
        type: "generate",
        message: "any query",
      })
    })

    expect(result.current.messages).toEqual([
      {
        role: "assistant",
        type: "error",
        output: "AI assistant is not configured: missing LLM_BASE_URL/LLM_API_KEY",
      },
    ])
  })

  it("ignores empty generate and fix payloads", async () => {
    const { result } = renderHook(() =>
      useAiQueryChat({ openaiUrl: "https://llm.example", openaiKey: "secret" }),
    )

    await act(async () => {
      await result.current.sendMessage({
        type: "generate",
        message: "   ",
      })
      await result.current.sendMessage({
        type: "fix",
        sql: "  ",
        errorMessage: "bad",
      })
      await result.current.sendMessage({
        type: "fix",
        sql: "select 1",
        errorMessage: "   ",
      })
    })

    expect(result.current.messages).toEqual([])
    expect(generateSqlWithOpenAiStreamMock).not.toHaveBeenCalled()
    expect(fixSqlWithOpenAiStreamMock).not.toHaveBeenCalled()
  })
})
