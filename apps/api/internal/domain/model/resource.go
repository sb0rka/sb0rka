package model

import (
	"time"
)

type Resource struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"project_id"`
	Kind      string    `json:"kind"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	ResourceState *ResourceState `json:"resource_state,omitempty"`
}

type ResourceState struct {
	ResourceID   string    `json:"resource_id"`
	RuntimeState string    `json:"runtime_state"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Secret struct {
	ResourceID     string     `json:"resource_id"`
	Name           string     `json:"name"`
	Description    *string    `json:"description,omitempty"`
	EncryptedValue string     `json:"encrypted_value"`
	Version        int        `json:"version"`
	RevealedAt     *time.Time `json:"revealed_at,omitempty"`

	ResourceState *ResourceState `json:"resource_state,omitempty"`

	Tags []Tag `json:"tags,omitempty"`
}

type DB struct {
	ResourceID          string  `json:"resource_id"`
	Name                string  `json:"name"`
	NormalizedName      string  `json:"normalized_name"`
	DesiredRuntimeState string  `json:"desired_runtime_state"`
	Description         *string `json:"description,omitempty"`

	ResourceState *ResourceState `json:"resource_state,omitempty"`

	Tags []Tag `json:"tags,omitempty"`
}

type DBVerifier struct {
	ProjectID              string `json:"project_id"`
	DBID                   string `json:"db_id"`
	PasswordSecretID       string `json:"password_secret_id"`
	PasswordVerifier       string `json:"password_verifier"`
	PasswordDesiredVersion int    `json:"password_desired_version"`
	PasswordDesiredState   string `json:"password_desired_state"`
}

type Tag struct {
	ID         int64   `json:"id"`
	ProjectID  string  `json:"project_id"`
	TagKey     string  `json:"tag_key"`
	TagValue   string  `json:"tag_value"`
	Color      *string `json:"color,omitempty"`
	IsSystem   bool    `json:"is_system"`
	IsReadonly bool    `json:"is_readonly"`
}

type ResourceTag struct {
	TagID      int64  `json:"tag_id"`
	ProjectID  string `json:"project_id"`
	ResourceID string `json:"resource_id"`
}
