type SyncState = "pending" | "ongoing" | "synced" | "failed"
type DesiredState = "present" | "absent"

export function getDatabaseStatusLabel(
  syncState?: SyncState,
  desiredState?: DesiredState,
): string {
  console.log("syncState", syncState)
  console.log("desiredState", desiredState)
  if (syncState === "synced" && desiredState === "present") {
    return "online"
  }

  if (syncState) {
    return syncState
  }

  return "pending"
}
