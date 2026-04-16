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
  createdAt: string
  updatedAt: string
  isHighlighted: boolean
}

export interface SecretRow {
  id: string
  name: string
  description?: string
  tablesCount: string
  columnsCount: string
  createdAt: string
  updatedAt: string
  isHighlighted: boolean
}
