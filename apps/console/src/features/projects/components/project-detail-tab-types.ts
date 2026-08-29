export interface DraftTag {
  tag_key: string
  tag_value: string
}

export interface DatabaseRow {
  id: string
  name: string
  description?: string
  tablesCount: number
  columnsCount: string
  syncState?: "pending" | "ongoing" | "synced" | "failed"
  desiredState?: "present" | "absent"
  createdAt: string
  updatedAt: string
  isHighlighted: boolean
  diskUsageLabel: string
}

export interface SecretRow {
  id: string
  name: string
  description?: string
  tablesCount: string
  columnsCount: string
  createdAt: string
  updatedAt: string
}

export interface CreateDatabaseFormState {
  newDatabaseName: string
  newDatabaseDescription: string
  newTagInput: string
  draftTags: DraftTag[]
  isCreatePending: boolean
}

export interface CreateDatabaseFormActions {
  onSubmitCreateDatabase: () => Promise<void>
  onAddDraftTag: (raw?: string) => void
  onNewDatabaseNameChange: (value: string) => void
  onNewDatabaseDescriptionChange: (value: string) => void
  onNewTagInputChange: (value: string) => void
}
