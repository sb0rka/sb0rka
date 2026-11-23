import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Brain, Image, Paperclip, Wrench, type LucideIcon } from "lucide-react"
import type { ModelCapability } from "../models-utils"

export const CAPABILITY_ICONS: Record<ModelCapability, LucideIcon> = {
  reasoning: Brain,
  toolCall: Wrench,
  vision: Image,
  attachment: Paperclip,
}

export function useCapabilityLabels(): Record<ModelCapability, string> {
  const { t } = useTranslation()
  return useMemo(
    () => ({
      reasoning: t("models.filters.reasoning"),
      toolCall: t("models.filters.toolCall"),
      vision: t("models.filters.vision"),
      attachment: t("models.filters.attachment"),
    }),
    [t],
  )
}
