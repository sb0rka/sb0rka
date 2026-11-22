import { useCallback, useSyncExternalStore } from "react"

import { quickStartEnabled } from "@/features/system/info"

export interface QuickStartProgress {
  stage: "initializing" | "welcome" | "project" | "key" | "ready"
  projectName?: string
  projectId?: string
  secretName?: string
  secretId?: string
}

const prefix = "sb0rka:quick-start:"
const changed = "quick-start-changed"
// Also supports browsers where local storage is unavailable.
const fallback = new Map<string, string>()

function snapshot(userId: string): string | null {
  if (!quickStartEnabled || !userId) return null
  const key = prefix + userId
  try {
    return localStorage.getItem(key) ?? fallback.get(key) ?? null
  } catch {
    return fallback.get(key) ?? null
  }
}

function parse(raw: string | null): QuickStartProgress | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    if (!value || !["initializing", "welcome", "project", "key", "ready"].includes(value.stage)) return null
    if ([value.projectName, value.projectId, value.secretName, value.secretId].some(v => v !== undefined && typeof v !== "string")) return null
    if ((value.stage === "key" || value.stage === "ready") && !value.projectId) return null
    if (value.stage === "ready" && !value.secretId) return null
    return value
  } catch {
    return null
  }
}

export function readProgress(userId: string) {
  return parse(snapshot(userId))
}

export function saveProgress(userId: string, progress: QuickStartProgress | null) {
  const key = prefix + userId
  const raw = progress ? JSON.stringify(progress) : null
  try {
    if (raw) localStorage.setItem(key, raw)
    else localStorage.removeItem(key)
    fallback.delete(key)
  } catch {
    if (raw) fallback.set(key, raw)
    else fallback.delete(key)
  }
  window.dispatchEvent(new Event(changed))
}

function subscribe(notify: () => void) {
  window.addEventListener(changed, notify)
  window.addEventListener("storage", notify)
  return () => {
    window.removeEventListener(changed, notify)
    window.removeEventListener("storage", notify)
  }
}

export function useQuickStartProgress(userId: string) {
  const raw = useSyncExternalStore(subscribe, useCallback(() => snapshot(userId), [userId]))
  return parse(raw)
}
