type SyncState = "pending" | "ongoing" | "synced" | "failed"
type DesiredState = "present" | "absent"

export function getDatabaseStatusLabel(
  t: (key: string) => string,
  syncState?: SyncState,
  desiredState?: DesiredState,
): string {
  if (syncState === "synced" && desiredState === "present") {
    return t("databases.status.online")
  }

  if (syncState) {
    return t(`databases.status.${syncState}`)
  }

  return t("databases.status.pending")
}
