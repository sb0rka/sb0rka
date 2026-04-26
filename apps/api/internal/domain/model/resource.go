package model

import (
	"time"
)

type Resource struct {
	ID           string    `json:"id"`
	ProjectID    string    `json:"project_id"`
	IsActive     bool      `json:"is_active"`
	ResourceType string    `json:"resource_type"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Secret struct {
	ResourceID      string     `json:"resource_id"`
	Name            string     `json:"name"`
	Description     *string    `json:"description,omitempty"`
	SecretValueHash string     `json:"secret_value_hash"`
	RevealedAt      *time.Time `json:"revealed_at,omitempty"`
}

type DB struct {
	ResourceID     string  `json:"resource_id"`
	Name           string  `json:"name"`
	NormalizedName string  `json:"normalized_name"`
	Description    *string `json:"description,omitempty"`
}

type Tag struct {
	ID        int64   `json:"id"`
	ProjectID string  `json:"project_id"`
	TagKey    string  `json:"tag_key"`
	TagValue  string  `json:"tag_value"`
	Color     *string `json:"color,omitempty"`
	IsSystem  bool    `json:"is_system"`
}

type ResourceTag struct {
	TagID      int64  `json:"tag_id"`
	ProjectID  string `json:"project_id"`
	ResourceID string `json:"resource_id"`
}
