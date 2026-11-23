import { useQuery } from "@tanstack/react-query"
import { ApiError, apiRequest } from "@/lib/api-client"

export interface PlatformInfo {
  version: string
  edition: string
  deployment: string
}

function isPlatformInfo(value: unknown): value is PlatformInfo {
  if (typeof value !== "object" || value === null) return false
  const info = value as Record<string, unknown>
  return (
    typeof info.version === "string" &&
    typeof info.edition === "string" &&
    typeof info.deployment === "string"
  )
}

export async function getPlatformInfo(): Promise<PlatformInfo> {
  const data = await apiRequest<unknown>({
    path: "/info",
    base: "resource",
    auth: false,
  })
  if (!isPlatformInfo(data)) throw new ApiError(502, "Invalid platform info")
  return data
}

export function isCommunityEdition(info: PlatformInfo | undefined): boolean {
  return info?.edition === "community"
}

export const quickStartEnabled = import.meta.env.VITE_IS_ENABLE_QUICK_START === "true"

export function hasCloudQuickStart(info: PlatformInfo | undefined): boolean {
  return quickStartEnabled && info?.edition === "enterprise" && info.deployment === "cloud"
}

export function usePlatformInfo() {
  return useQuery({
    queryKey: ["platform", "info"],
    queryFn: getPlatformInfo,
  })
}
