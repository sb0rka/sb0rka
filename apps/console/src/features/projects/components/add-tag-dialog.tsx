import { useEffect, useState, type FormEventHandler } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { parseDraftTag } from "../parse-draft-tag"
import type { DraftTag } from "./project-detail-tab-types"

export type AddTagDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Unique id for the tag input (accessibility). */
  inputId: string
  isSubmitting?: boolean
  /**
   * Return a user-visible error message if the tag must be rejected (e.g. duplicate),
   * or `null` if the tag may be submitted.
   */
  checkDuplicate: (parsed: DraftTag) => string | null
  /**
   * Add the tag. Return `false` to leave the dialog open. Rejections are passed to
   * `mapSubmitError` when present.
   */
  onSubmit: (parsed: DraftTag) => boolean | void | Promise<boolean | void>
  mapSubmitError?: (error: unknown) => string
}

export function AddTagDialog({
  open,
  onOpenChange,
  inputId,
  isSubmitting = false,
  checkDuplicate,
  onSubmit,
  mapSubmitError,
}: AddTagDialogProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setInput("")
      setError(null)
    }
  }, [open])

  function handleOpenChange(next: boolean) {
    if (!next) {
      setInput("")
      setError(null)
    }
    onOpenChange(next)
  }

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault()
    if (isSubmitting) return

    setError(null)

    const parsed = parseDraftTag(input)
    if (!parsed) {
      setError(t("common.messages.tagFormat"))
      return
    }

    const dupMsg = checkDuplicate(parsed)
    if (dupMsg) {
      setError(dupMsg)
      return
    }

    try {
      const result = await Promise.resolve(onSubmit(parsed))
      if (result !== false) {
        handleOpenChange(false)
      }
    } catch (err) {
      const fallback = t("common.messages.tagAddError")
      setError(mapSubmitError ? mapSubmitError(err) : fallback)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} autoComplete="off">
          <DialogHeader>
            <DialogTitle className="text-lg">{t("databases.addTagModalTitle")}</DialogTitle>
            <DialogDescription>{t("databases.tagInputHint")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-6 pb-6">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={inputId}>{t("common.labels.tags")}</Label>
              <Input
                id={inputId}
                name="draft-tag"
                autoComplete="off"
                placeholder={t("databases.tagExample")}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter className="justify-end gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              {t("common.actions.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {t("common.actions.add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
