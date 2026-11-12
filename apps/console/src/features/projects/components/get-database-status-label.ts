import type { DatabaseResponse } from "../api"

export type DatabaseStatusKey = "online" | "pending" | "failed" | "stopped"

const PROVISIONING_RUNTIME_STATES = new Set([
  "creating",
  "syncing",
  "starting",
  "stopping",
  "deleting",
])

type DatabaseStatusSource = Pick<DatabaseResponse, "desired_runtime_state" | "resource_state">

export function databaseStatusKey(db: DatabaseStatusSource): DatabaseStatusKey {
  const runtime = db.resource_state?.runtime_state
  const desired = db.desired_runtime_state

  if (runtime === "failed") return "failed"
  // Keep polling through in-progress runtime even if desired state is already suspended.
  if (runtime && PROVISIONING_RUNTIME_STATES.has(runtime)) return "pending"
  if (
    runtime === "stopped" ||
    runtime === "deleted" ||
    desired === "suspended" ||
    desired === "terminated"
  ) {
    return "stopped"
  }
  if (runtime === "available" && desired === "running") return "online"
  return "pending"
}

export function isDatabaseCredentialsAvailable(db: DatabaseStatusSource): boolean {
  return databaseStatusKey(db) === "online"
}

export function databaseSyncStatusNeedsPolling(db: DatabaseStatusSource): boolean {
  return databaseStatusKey(db) === "pending"
}

export function getDatabaseStatusLabel(
  t: (key: string) => string,
  db: DatabaseStatusSource,
): string {
  return t(`databases.status.${databaseStatusKey(db)}`)
}
