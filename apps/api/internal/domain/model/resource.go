package model

import (
	"time"
)

type Resource struct {
	ID           int64     `json:"id"`
	ProjectID    int64     `json:"project_id"`
	IsActive     bool      `json:"is_active"`
	ResourceType string    `json:"resource_type"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Secret struct {
	ResourceID      int64      `json:"resource_id"`
	Name            string     `json:"name"`
	Description     *string    `json:"description,omitempty"`
	SecretValueHash string     `json:"secret_value_hash"`
	RevealedAt      *time.Time `json:"revealed_at,omitempty"`
}

type DB struct {
	ResourceID  int64   `json:"resource_id"`
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	Endpoint    *string `json:"endpoint,omitempty"`
	NextTableID int64   `json:"next_table_id"`
}

type DBTable struct {
	ID           int64     `json:"id"`
	DBID         int64     `json:"db_id"`
	Name         string    `json:"name"`
	Description  *string   `json:"description,omitempty"`
	NextColumnID int64     `json:"next_column_id"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type DBTableColumn struct {
	ID           int64     `json:"id"`
	TableID      int64     `json:"table_id"`
	DBID         int64     `json:"db_id"`
	Name         string    `json:"name"`
	DataType     string    `json:"data_type"`
	IsPrimaryKey bool      `json:"is_primary_key"`
	IsNullable   bool      `json:"is_nullable"`
	IsUnique     bool      `json:"is_unique"`
	IsArray      bool      `json:"is_array"`
	DefaultValue *string   `json:"default_value,omitempty"`
	ForeignKey   *string   `json:"foreign_key,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Tag struct {
	ID        int64   `json:"id"`
	ProjectID int64   `json:"project_id"`
	TagKey    string  `json:"tag_key"`
	TagValue  string  `json:"tag_value"`
	Color     *string `json:"color,omitempty"`
	IsSystem  bool    `json:"is_system"`
}

type ResourceTag struct {
	TagID      int64 `json:"tag_id"`
	ProjectID  int64 `json:"project_id"`
	ResourceID int64 `json:"resource_id"`
}
