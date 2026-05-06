package model

const (
	DBDesiredRuntimeStateRunning    = "running"
	DBDesiredRuntimeStateSuspended  = "suspended"
	DBDesiredRuntimeStateTerminated = "terminated"
)

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
