import { useTranslation } from "react-i18next"
import { ClipboardPaste, Copy, Play } from "lucide-react"
import { Button } from "@/components/ui/button"

export type AiQueryChatSqlActionsProps = {
  sql: string
  isPending: boolean
  onApplySql?: (sql: string) => void
  onApplySqlAndRun?: (sql: string) => void
  applySqlAndRunDisabled?: boolean
}

async function copySql(sql: string) {
  try {
    await navigator.clipboard.writeText(sql)
  } catch {
    // ignore
  }
}

export function AiQueryChatSqlActions({
  sql,
  isPending,
  onApplySql,
  onApplySqlAndRun,
  applySqlAndRunDisabled,
}: AiQueryChatSqlActionsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
        disabled={isPending}
        onClick={() => void copySql(sql)}
        aria-label={t("dataExplorer.aiChatCopySql")}
      >
        <Copy className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
        disabled={isPending || !onApplySql}
        onClick={() => onApplySql?.(sql)}
        aria-label={t("dataExplorer.aiChatApplySql")}
      >
        <ClipboardPaste className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
        disabled={
          isPending ||
          !onApplySqlAndRun ||
          Boolean(applySqlAndRunDisabled) ||
          sql.trim().length === 0
        }
        onClick={() => onApplySqlAndRun?.(sql)}
        aria-label={t("dataExplorer.aiChatApplySqlAndRun")}
      >
        <Play className="h-4 w-4" />
      </Button>
    </div>
  )
}
