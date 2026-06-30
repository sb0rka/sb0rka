import { useCallback, useEffect, useState } from "react"

const DB_NAME = "sb0rka.console.sqlExplorer"
const DB_VERSION = 2
const STORE_NAME = "sqlHistory"
const BOOKMARK_INDEX_NAME = "byDatabaseBookmarkCreatedV2"

export type SqlExplorerHistoryItem = {
  id: string
  projectId: string
  databaseId: string
  title: string
  sql: string
  bookmarked: boolean
  bookmarkedKey?: 0 | 1
  createdAt: string
  updatedAt: string
}

export type SaveSqlExplorerHistoryItemInput = {
  projectId: string
  databaseId: string
  title: string
  sql: string
  bookmarked?: boolean
}

type SqlExplorerHistoryState = {
  history: SqlExplorerHistoryItem[]
  bookmarks: SqlExplorerHistoryItem[]
  isLoading: boolean
}

function isIndexedDbAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window
}

function nowIso(): string {
  return new Date().toISOString()
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function normalizeTitle(title: string): string {
  const normalized = title.trim().replace(/\s+/g, " ")
  return normalized.length > 0 ? normalized.slice(0, 160) : "Untitled SQL"
}

function normalizeSql(sql: string): string {
  return sql.trim()
}

function databaseKey(projectId: string, databaseId: string): IDBKeyRange {
  return IDBKeyRange.bound(
    [projectId, databaseId, ""],
    [projectId, databaseId, "\uffff"],
  )
}

function bookmarkKey(projectId: string, databaseId: string): IDBKeyRange {
  return IDBKeyRange.bound(
    [projectId, databaseId, 1, ""],
    [projectId, databaseId, 1, "\uffff"],
  )
}

function toBookmarkKey(bookmarked: boolean): 0 | 1 {
  return bookmarked ? 1 : 0
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"))
  })
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) return Promise.resolve(null)

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction?.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: "id" })

      if (!store) return
      if (!store.indexNames.contains("byDatabaseCreated")) {
        store.createIndex("byDatabaseCreated", ["projectId", "databaseId", "createdAt"])
      }
      if (!store.indexNames.contains(BOOKMARK_INDEX_NAME)) {
        store.createIndex(BOOKMARK_INDEX_NAME, [
          "projectId",
          "databaseId",
          "bookmarkedKey",
          "createdAt",
        ])
      }
      store.openCursor().onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
        if (!cursor) return
        const value = cursor.value as Partial<SqlExplorerHistoryItem>
        cursor.update({
          ...value,
          bookmarkedKey: toBookmarkKey(value.bookmarked === true),
        })
        cursor.continue()
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Unable to open SQL history store"))
  })
}

async function readDatabaseItems(
  projectId: string,
  databaseId: string,
  bookmarkedOnly: boolean,
): Promise<SqlExplorerHistoryItem[]> {
  const db = await openDatabase()
  if (!db) return []

  try {
    const tx = db.transaction(STORE_NAME, "readonly")
    const store = tx.objectStore(STORE_NAME)
    const index = bookmarkedOnly
      ? store.index(BOOKMARK_INDEX_NAME)
      : store.index("byDatabaseCreated")
    const items = await requestToPromise<SqlExplorerHistoryItem[]>(
      index.getAll(
        bookmarkedOnly
          ? bookmarkKey(projectId, databaseId)
          : databaseKey(projectId, databaseId),
      ),
    )
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } finally {
    db.close()
  }
}

export async function listSqlExplorerHistory(
  projectId: string,
  databaseId: string,
): Promise<SqlExplorerHistoryItem[]> {
  if (!projectId || !databaseId) return []
  return readDatabaseItems(projectId, databaseId, false)
}

export async function listSqlExplorerBookmarks(
  projectId: string,
  databaseId: string,
): Promise<SqlExplorerHistoryItem[]> {
  if (!projectId || !databaseId) return []
  return readDatabaseItems(projectId, databaseId, true)
}

export async function saveSqlExplorerHistoryItem(
  input: SaveSqlExplorerHistoryItemInput,
): Promise<SqlExplorerHistoryItem | null> {
  const projectId = input.projectId.trim()
  const databaseId = input.databaseId.trim()
  const sql = normalizeSql(input.sql)
  if (!projectId || !databaseId || !sql) return null

  const db = await openDatabase()
  if (!db) return null

  try {
    const existingItems = await listSqlExplorerHistory(projectId, databaseId)
    const existing = existingItems.find((item) => item.sql.trim() === sql)
    const timestamp = nowIso()
    const item: SqlExplorerHistoryItem = existing
      ? {
          ...existing,
          title: normalizeTitle(input.title),
          sql,
          bookmarked: input.bookmarked ?? existing.bookmarked,
          bookmarkedKey: toBookmarkKey(input.bookmarked ?? existing.bookmarked),
          updatedAt: timestamp,
        }
      : {
          id: createId(),
          projectId,
          databaseId,
          title: normalizeTitle(input.title),
          sql,
          bookmarked: input.bookmarked ?? false,
          bookmarkedKey: toBookmarkKey(input.bookmarked ?? false),
          createdAt: timestamp,
          updatedAt: timestamp,
        }

    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    await requestToPromise(store.put(item))
    return item
  } finally {
    db.close()
  }
}

export async function setSqlExplorerHistoryItemBookmarked(
  id: string,
  bookmarked: boolean,
): Promise<SqlExplorerHistoryItem | null> {
  const db = await openDatabase()
  if (!db) return null

  try {
    const readTx = db.transaction(STORE_NAME, "readonly")
    const current = await requestToPromise<SqlExplorerHistoryItem | undefined>(
      readTx.objectStore(STORE_NAME).get(id),
    )
    if (!current) return null

    const next: SqlExplorerHistoryItem = {
      ...current,
      bookmarked,
      bookmarkedKey: toBookmarkKey(bookmarked),
      updatedAt: nowIso(),
    }

    const tx = db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    await requestToPromise(store.put(next))
    return next
  } finally {
    db.close()
  }
}

export function useSqlExplorerHistory(projectId: string, databaseId?: string | null) {
  const [state, setState] = useState<SqlExplorerHistoryState>({
    history: [],
    bookmarks: [],
    isLoading: false,
  })

  const load = useCallback(async () => {
    const normalizedDatabaseId = databaseId?.trim() ?? ""
    if (!projectId || !normalizedDatabaseId) {
      setState({ history: [], bookmarks: [], isLoading: false })
      return
    }

    setState((current) => ({ ...current, isLoading: true }))
    try {
      const [history, bookmarks] = await Promise.all([
        listSqlExplorerHistory(projectId, normalizedDatabaseId),
        listSqlExplorerBookmarks(projectId, normalizedDatabaseId),
      ])
      setState({ history, bookmarks, isLoading: false })
    } catch {
      setState({ history: [], bookmarks: [], isLoading: false })
    }
  }, [databaseId, projectId])

  useEffect(() => {
    let cancelled = false
    async function run() {
      const normalizedDatabaseId = databaseId?.trim() ?? ""
      if (!projectId || !normalizedDatabaseId) {
        setState({ history: [], bookmarks: [], isLoading: false })
        return
      }
      setState((current) => ({ ...current, isLoading: true }))
      try {
        const [history, bookmarks] = await Promise.all([
          listSqlExplorerHistory(projectId, normalizedDatabaseId),
          listSqlExplorerBookmarks(projectId, normalizedDatabaseId),
        ])
        if (!cancelled) setState({ history, bookmarks, isLoading: false })
      } catch {
        if (!cancelled) setState({ history: [], bookmarks: [], isLoading: false })
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [databaseId, projectId])

  const saveSuccessfulAiRun = useCallback(
    async (input: Omit<SaveSqlExplorerHistoryItemInput, "projectId" | "databaseId">) => {
      const normalizedDatabaseId = databaseId?.trim() ?? ""
      if (!projectId || !normalizedDatabaseId) return null
      const item = await saveSqlExplorerHistoryItem({
        ...input,
        projectId,
        databaseId: normalizedDatabaseId,
      })
      await load()
      return item
    },
    [databaseId, load, projectId],
  )

  const toggleBookmark = useCallback(
    async (item: SqlExplorerHistoryItem, bookmarked?: boolean) => {
      const next = await setSqlExplorerHistoryItemBookmarked(
        item.id,
        bookmarked ?? !item.bookmarked,
      )
      await load()
      return next
    },
    [load],
  )

  return {
    ...state,
    refresh: load,
    saveSuccessfulAiRun,
    toggleBookmark,
  }
}
