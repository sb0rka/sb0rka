import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { Bookmark, Clock3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { SqlExplorerHistoryItem } from "../sql-explorer-history-storage"
import type { AiQueryChatSqlApplyMeta } from "../use-ai-query-chat"
import {
  AiQueryChatHistoryDialog,
  type AiQueryChatHistoryView,
} from "./ai-query-chat-history-dialog"
import { cn } from "@/lib/utils"

export type AiQueryChatHistoryDropdownProps = {
  historyItems: SqlExplorerHistoryItem[]
  bookmarkItems: SqlExplorerHistoryItem[]
  historyLoading?: boolean
  applySqlAndRunDisabled?: boolean
  isQueryRunning?: boolean
  onToggleHistoryItemBookmark?: (item: SqlExplorerHistoryItem) => void
  onApplySql?: (sql: string, meta?: AiQueryChatSqlApplyMeta) => void
  onApplySqlAndRun?: (sql: string, meta?: AiQueryChatSqlApplyMeta) => void
}

export function AiQueryChatHistoryDropdown({
  historyItems,
  bookmarkItems,
  historyLoading,
  applySqlAndRunDisabled,
  isQueryRunning,
  onToggleHistoryItemBookmark,
  onApplySql,
  onApplySqlAndRun,
}: AiQueryChatHistoryDropdownProps) {
  const { t } = useTranslation()
  const [historyDropdownOpen, setHistoryDropdownOpen] = useState(false)
  const [historyView, setHistoryView] = useState<AiQueryChatHistoryView>("history")
  const historyDropdownRef = useRef<HTMLDivElement>(null)
  const historyButtonRef = useRef<HTMLButtonElement>(null)
  const bookmarksButtonRef = useRef<HTMLButtonElement>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  function openHistoryDropdown(view: AiQueryChatHistoryView) {
    if (historyDropdownOpen && historyView === view) {
      setHistoryDropdownOpen(false)
      return
    }
    setHistoryView(view)
    setHistoryDropdownOpen(true)
  }

  function applyHistorySql(sql: string, title: string) {
    onApplySql?.(sql, { source: "history", title })
    setHistoryDropdownOpen(false)
  }

  function applyAndRunHistorySql(sql: string, title: string) {
    onApplySqlAndRun?.(sql, { source: "history", title })
    setHistoryDropdownOpen(false)
  }

  useEffect(() => {
    if (!historyDropdownOpen) return
    function updateAnchorRect() {
      const button =
        historyView === "history" ? historyButtonRef.current : bookmarksButtonRef.current
      if (!button) return
      setAnchorRect(button.getBoundingClientRect())
    }
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null
      if (!target) return
      if (historyDropdownRef.current?.contains(target)) return
      if (historyButtonRef.current?.contains(target)) return
      if (bookmarksButtonRef.current?.contains(target)) return
      setHistoryDropdownOpen(false)
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setHistoryDropdownOpen(false)
    }
    updateAnchorRect()
    window.addEventListener("mousedown", handlePointerDown)
    window.addEventListener("keydown", handleEscape)
    window.addEventListener("resize", updateAnchorRect)
    window.addEventListener("scroll", updateAnchorRect, true)
    return () => {
      window.removeEventListener("mousedown", handlePointerDown)
      window.removeEventListener("keydown", handleEscape)
      window.removeEventListener("resize", updateAnchorRect)
      window.removeEventListener("scroll", updateAnchorRect, true)
    }
  }, [historyDropdownOpen, historyView])

  const dropdownStyle = useMemo(() => {
    if (!anchorRect) return null
    const width = 672
    const viewportPadding = 8
    const bottomGap = 80
    const top = anchorRect.bottom + 6
    const rightAlignedLeft = anchorRect.right - width
    const left = Math.max(
      viewportPadding,
      Math.min(rightAlignedLeft, window.innerWidth - width - viewportPadding),
    )
    const height = Math.max(220, window.innerHeight - top - bottomGap)
    return {
      left,
      top,
      width,
      height,
    }
  }, [anchorRect])

  return (
    <div className="relative flex items-center gap-1">
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={historyButtonRef}
              type="button"
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", historyDropdownOpen && historyView === "history" && "bg-muted")}
              onClick={() => openHistoryDropdown("history")}
              aria-label={t("dataExplorer.aiChatHistory")}
            >
              <Clock3 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("dataExplorer.aiChatHistory")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={bookmarksButtonRef}
              type="button"
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", historyDropdownOpen && historyView === "bookmarks" && "bg-muted")}
              onClick={() => openHistoryDropdown("bookmarks")}
              aria-label={t("dataExplorer.aiChatBookmarks")}
            >
              <Bookmark className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("dataExplorer.aiChatBookmarks")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {historyDropdownOpen && dropdownStyle
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[70] animate-in fade-in-0 bg-black/20 backdrop-brightness-[0.95] backdrop-saturate-[0.80] duration-200 dark:bg-black/40"
                aria-hidden
                onMouseDown={() => setHistoryDropdownOpen(false)}
              />
              <div
                ref={historyDropdownRef}
                className="fixed z-[80]"
                style={{
                  left: dropdownStyle.left,
                  top: dropdownStyle.top,
                  width: dropdownStyle.width,
                  height: dropdownStyle.height,
                }}
              >
                <AiQueryChatHistoryDialog
                  view={historyView}
                  historyItems={historyItems}
                  bookmarkItems={bookmarkItems}
                  isLoading={historyLoading}
                  applySqlAndRunDisabled={applySqlAndRunDisabled}
                  isQueryRunning={isQueryRunning}
                  onViewChange={setHistoryView}
                  onApplySql={applyHistorySql}
                  onApplySqlAndRun={applyAndRunHistorySql}
                  onToggleBookmark={onToggleHistoryItemBookmark}
                />
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  )
}
