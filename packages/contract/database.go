package contract

import "time"

type CreateDatabaseRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
}

type CreateDatabaseTableRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
}

type UpdateDatabaseTableRequest struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
}

type CreateDatabaseColumnRequest struct {
	Name         string  `json:"name"`
	DataType     string  `json:"data_type"`
	IsPK         bool    `json:"is_pk"`
	IsNullable   bool    `json:"is_nullable"`
	IsUnique     bool    `json:"is_unique"`
	IsArray      bool    `json:"is_array"`
	DefaultValue *string `json:"default_value,omitempty"`
	FK           *string `json:"fk,omitempty"`
}

type UpdateDatabaseColumnRequest struct {
	Name string `json:"name"`
}

type DatabaseResponse struct {
	ResourceID  string  `json:"resource_id"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	NextTableID int64   `json:"next_table_id"`
}

type DatabaseListResponse struct {
	Databases []DatabaseResponse `json:"databases"`
}

type DBTableResponse struct {
	ID           int64     `json:"id"`
	DBID         int64     `json:"db_id"`
	Name         string    `json:"name"`
	Description  *string   `json:"description,omitempty"`
	NextColumnID int64     `json:"next_column_id"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type DBTableListResponse struct {
	Tables []DBTableResponse `json:"tables"`
}

type DBTableColumnResponse struct {
	ID           int64     `json:"id"`
	TableID      int64     `json:"table_id"`
	DBID         int64     `json:"db_id"`
	Name         string    `json:"name"`
	DataType     string    `json:"data_type"`
	IsPK         bool      `json:"is_pk"`
	IsNullable   bool      `json:"is_nullable"`
	IsUnique     bool      `json:"is_unique"`
	IsArray      bool      `json:"is_array"`
	DefaultValue *string   `json:"default_value,omitempty"`
	FK           *string   `json:"fk,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type DBTableColumnListResponse struct {
	Columns []DBTableColumnResponse `json:"columns"`
}
