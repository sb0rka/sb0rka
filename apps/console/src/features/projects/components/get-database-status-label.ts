import type { DatabaseResponse } from "../api"

type SyncState = "pending" | "ongoing" | "synced" | "failed"
type DesiredState = "present" | "absent"

/** True when sync finished successfully and resource should exist — credentials may be fetched. */
export function isDatabaseCredentialsAvailable(
  db: Pick<DatabaseResponse, "sync_state" | "desired_state">,
): boolean {
  return db.sync_state === "synced" && db.desired_state === "present"
}

/**
 * While true, poll list/detail queries so UI updates when provisioning finishes.
 * Stops when online, failed, or in a settled non-provisioning state we do not expect to change without a refetch trigger.
 */
export function databaseSyncStatusNeedsPolling(
  db: Pick<DatabaseResponse, "sync_state" | "desired_state">,
): boolean {
  if (db.sync_state === "failed") return false
  if (isDatabaseCredentialsAvailable(db)) return false
  if (db.sync_state === "pending" || db.sync_state === "ongoing") return true
  if (db.sync_state === undefined) return true
  if (db.sync_state === "synced" && db.desired_state === undefined) return true
  return false
}

export function getDatabaseStatusLabel(
  t: (key: string) => string,
  syncState?: SyncState,
  desiredState?: DesiredState,
): string {
  if (
    isDatabaseCredentialsAvailable({
      sync_state: syncState,
      desired_state: desiredState,
    })
  ) {
    return t("databases.status.online")
  }

  if (syncState) {
    return t(`databases.status.${syncState}`)
  }

  return t("databases.status.pending")
}
