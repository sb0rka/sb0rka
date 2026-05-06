package model

import "time"

const (
	ResourceKindDatabase = "database"
	ResourceKindSecret   = "secret"

	RuntimeStateSyncing   = "syncing"
	RuntimeStateCreating  = "creating"
	RuntimeStateAvailable = "available"
	RuntimeStateStopping  = "stopping"
	RuntimeStateStopped   = "stopped"
	RuntimeStateStarting  = "starting"
	RuntimeStateDeleting  = "deleting"
	RuntimeStateDeleted   = "deleted"
	RuntimeStateFailed    = "failed"
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
