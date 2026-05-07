package contract

const (
	DBDesiredRuntimeStateRunning    = "running"
	DBDesiredRuntimeStateSuspended  = "suspended"
	DBDesiredRuntimeStateTerminated = "terminated"
)

type CreateDatabaseRequest struct {
	Name                string  `json:"name"`
	Description         *string `json:"description,omitempty"`
	DesiredRuntimeState string  `json:"desired_runtime_state"`
}

type UpdateDatabaseRequest struct {
	Name                *string `json:"name,omitempty"`
	Description         *string `json:"description,omitempty"`
	DesiredRuntimeState *string `json:"desired_runtime_state,omitempty"`
}

type DatabaseResponse struct {
	DatabaseID          string  `json:"database_id"`
	Name                string  `json:"name"`
	NormalizedName      string  `json:"normalized_name"`
	Description         *string `json:"description,omitempty"`
	DesiredRuntimeState string  `json:"desired_runtime_state"`

	ResourceState *ResourceStateResponse `json:"resource_state,omitempty"`

	Tags []TagResponse `json:"tags,omitempty"`
}

type DatabaseListResponse struct {
	ProjectID string             `json:"project_id"`
	Databases []DatabaseResponse `json:"databases"`
}

type DatabaseConnParamsResponse struct {
	Host             string `json:"host"`
	Port             int    `json:"port"`
	User             string `json:"user"`
	PasswordSecretID string `json:"password_secret_id"`
	DatabaseName     string `json:"database_name"`
}
