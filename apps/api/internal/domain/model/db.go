package model

import "github.com/google/uuid"

const (
	DBDesiredRuntimeStateRunning    = "running"
	DBDesiredRuntimeStateSuspended  = "suspended"
	DBDesiredRuntimeStateTerminated = "terminated"
)

type DBInstance struct {
	PublicID            string    `json:"public_id"`
	ProjectID           uuid.UUID `json:"project_id"`
	ResourceID          uuid.UUID `json:"resource_id"`
	Engine              string    `json:"engine"`
	Name                string    `json:"name"`
	NormalizedName      string    `json:"normalized_name"`
	DesiredRuntimeState string    `json:"desired_runtime_state"`
	Description         *string   `json:"description,omitempty"`

	ResourceState *ResourceState `json:"resource_state,omitempty"`

	Tags []Tag `json:"tags,omitempty"`
}

type DBInstanceVerifier struct {
	ProjectID              uuid.UUID `json:"project_id"`
	DBInstanceID           uuid.UUID `json:"dbi_id"`
	PasswordSecretID       uuid.UUID `json:"password_secret_id"`
	PasswordVerifier       string    `json:"password_verifier"`
	PasswordDesiredVersion int32     `json:"password_desired_version"`
	PasswordDesiredState   string    `json:"password_desired_state"`
}
