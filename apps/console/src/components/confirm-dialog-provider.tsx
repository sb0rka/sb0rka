import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
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
import { Input } from "./ui/input"

export interface ConfirmDialogOptions {
  title: string
  description?: string
  infoNode?: React.ReactNode
  strongConfirmValue?: string
  confirmText?: string
  cancelText?: string
  confirmVariant?: "default" | "destructive"
}

interface ConfirmRequest {
  id: number
  options: ConfirmDialogOptions
  resolve: (result: boolean) => void
}

type ConfirmDialogContextValue = (options: ConfirmDialogOptions) => Promise<boolean>

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null)

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const requestIdRef = useRef(0)
  const [queue, setQueue] = useState<ConfirmRequest[]>([])
  const activeRequest = queue[0] ?? null
  const [userInput, setUserInput] = useState("");

  const isConfirmDisabled = useMemo(() => {
    if (!activeRequest) return true
    const expected = activeRequest.options.strongConfirmValue
    if (expected && (expected !== userInput.trim())) {
        return true
    }
    return false
  }, [activeRequest, userInput])

  const resolveRequest = useCallback((requestId: number, result: boolean) => {
    let requestToResolve: ConfirmRequest | undefined

    setQueue((current) => {
      if (!current.length || current[0].id !== requestId) return current
      requestToResolve = current[0]
      return current.slice(1)
    })

    requestToResolve?.resolve(result)
  }, [])

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      setQueue((current) => [
        ...current,
        {
          id: requestIdRef.current++,
          options,
          resolve,
        },
      ])
    })
  }, [])

  const contextValue = useMemo(() => confirm, [confirm])

  return (
    <ConfirmDialogContext.Provider value={contextValue}>
      {children}
      <Dialog
        open={Boolean(activeRequest)}
        onOpenChange={(open) => {
          if (!open && activeRequest) {
            resolveRequest(activeRequest.id, false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeRequest?.options.title}</DialogTitle>
            {activeRequest?.options.description ? (
              <DialogDescription>{activeRequest.options.description}</DialogDescription>
            ) : null}
          </DialogHeader>
          {activeRequest?.options.infoNode}
          {activeRequest?.options.strongConfirmValue && (
            <div className="p-6">
              <Input
                id="strong-confirm-input"
                onChange={(e) => setUserInput(e.target.value)}
                placeholder={activeRequest.options.strongConfirmValue}
                required
                />
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (activeRequest) resolveRequest(activeRequest.id, false)
              }}
            >
              {activeRequest?.options.cancelText ?? t("common.actions.cancel")}
            </Button>
            <Button
              type="button"
              variant={activeRequest?.options.confirmVariant ?? "default"}
              disabled={isConfirmDisabled}
              onClick={() => {
                if (activeRequest) resolveRequest(activeRequest.id, true)
              }}
            >
              {activeRequest?.options.confirmText ?? t("common.actions.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmDialogContext.Provider>
  )
}

export function useConfirmDialog() {
  const context = useContext(ConfirmDialogContext)
  if (!context) {
    throw new Error("useConfirmDialog must be used within ConfirmDialogProvider")
  }
  return context
}
