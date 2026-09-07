import { useEffect, useRef, type KeyboardEvent, type ClipboardEvent } from "react"
import { Input } from "./input"
import { cn } from "@/lib/utils"

interface OtpInputProps {
  length?: number
  value: string[]
  onChange: (value: string[]) => void
  onComplete?: (code: string) => void
  disabled?: boolean
  error?: string | null
  autoFocus?: boolean
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  error = null,
  autoFocus = true,
}: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([])

  function setDigit(index: number, char: string) {
    const next = [...value]
    next[index] = char

    onChange(next)

    if (next.every((c) => c !== "")) {
      onComplete?.(next.join(""))
    }
  }

  function normilizeChars(raw: string): string {
    return raw.toUpperCase().replace(/[^0-9A-Z]/g, "")
  }

  function handleChange(index: number, raw: string) {
    if (!raw) {
      setDigit(index, "")
      return
    }

    const normalized = normilizeChars(raw.slice(-1))
    if (!normalized) return

    const char = normalized.slice(-1)
    setDigit(index, char)
    if (index < length - 1) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault()
      if (value[index]) {
        setDigit(index, "")
      } else if (index > 0) {
        setDigit(index - 1, "")
        inputsRef.current[index - 1]?.focus()
      }
      return
    }

    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault()
      inputsRef.current[index - 1]?.focus()
    }
    if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault()
      inputsRef.current[index + 1]?.focus()
    }
  }

  function handlePaste(index: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = normilizeChars(e.clipboardData.getData("text"))
    if (!pasted) return

    const next = [...value]
    let cursor = index
    for (const char of pasted) {
      if (cursor >= length) break
      next[cursor] = char
      cursor++
    }
    onChange(next)

    const focusIndex = Math.min(cursor, length - 1)
    inputsRef.current[focusIndex]?.focus()

    if (next.every((c) => c !== "")) {
      onComplete?.(next.join(""))
    }
  }

  useEffect(() => {
    if (autoFocus) {
      inputsRef.current[0]?.focus()
    }
  }, [autoFocus])

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-2">
        {Array.from({ length }).map((_, index) => (
          <Input
            key={index}
            ref={(el) => {
              inputsRef.current[index] = el
            }}
            type="text"
            autoComplete="one-time-code"
            maxLength={1}
            value={value[index] ?? ""}
            disabled={disabled}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={(e) => handlePaste(index, e)}
            onFocus={(e) => e.target.select()}
            className={cn(
              "h-12 w-10 rounded-md border bg-background text-center text-lg font-medium uppercase",
              "outline-none transition-colors",
              "focus:border-primary focus:ring-1 focus:ring-primary",
              error ? "border-destructive" : "border-input",
              disabled && "cursor-not-allowed opacity-50",
            )}
          />
        ))}
      </div>
    </div>
  )
}
