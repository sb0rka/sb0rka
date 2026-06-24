import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"
import { type AiQueryChatMessage } from "../use-ai-query-chat"

const SCROLL_BOTTOM_THRESHOLD_PX = 12

export function isNearScrollBottom(
  element: HTMLElement,
  threshold = SCROLL_BOTTOM_THRESHOLD_PX,
): boolean {
  const distanceFromBottom =
    element.scrollHeight - element.scrollTop - element.clientHeight
  return distanceFromBottom <= threshold
}

export function messagesAutoScrollKey(messages: AiQueryChatMessage[]): string {
  const parts: string[] = []
  for (const m of messages) {
    if (m.role === "user") {
      parts.push("u")
      continue
    }
    switch (m.type) {
      case "thinking":
      case "sql":
      case "error":
        parts.push(String(m.output.length))
        break
      case "fix":
        parts.push(String(m.explanation.length))
        break
      default:
        parts.push("?")
    }
  }
  return parts.join("|")
}

type UseAutoScrollOnContentChangeOptions = {
  /** Re-enable stick-to-bottom when this flips from false to true (e.g. a new request). */
  resetWhen?: boolean
}

/**
 * Pins a scrollable container to the bottom while content streams in.
 * Autoscroll pauses after the user scrolls up and resumes when they reach the bottom again.
 */
export function useAutoScrollOnContentChange(
  ref: RefObject<HTMLElement | null>,
  content: string,
  enabled: boolean,
  extraDeps: readonly unknown[] = [],
  options?: UseAutoScrollOnContentChangeOptions,
) {
  const stickToBottomRef = useRef(true)
  const prevEnabledRef = useRef(enabled)
  const prevResetWhenRef = useRef(options?.resetWhen ?? false)

  useEffect(() => {
    if (enabled && !prevEnabledRef.current) {
      stickToBottomRef.current = true
    }
    prevEnabledRef.current = enabled
  }, [enabled])

  useEffect(() => {
    const resetWhen = options?.resetWhen ?? false
    if (resetWhen && !prevResetWhenRef.current) {
      stickToBottomRef.current = true
    }
    prevResetWhenRef.current = resetWhen
  }, [options?.resetWhen])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onScroll = () => {
      stickToBottomRef.current = isNearScrollBottom(el)
    }

    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [ref, content, enabled])

  useLayoutEffect(() => {
    if (!enabled || !stickToBottomRef.current) return
    const el = ref.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    // eslint-disable-next-line react-hooks/exhaustive-deps -- extraDeps are intentional scroll triggers
  }, [content, enabled, ref, ...extraDeps])
}
