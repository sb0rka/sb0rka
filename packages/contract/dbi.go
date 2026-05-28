package contract

const (
	DBInstanceDesiredRuntimeStateRunning    = "running"
	DBInstanceDesiredRuntimeStateSuspended  = "suspended"
	DBInstanceDesiredRuntimeStateTerminated = "terminated"
)

type CreateDBInstanceRequest struct {
	Name                string  `json:"name"`
	Description         *string `json:"description,omitempty"`
	DesiredRuntimeState string  `json:"desired_runtime_state"`
}

type UpdateDBInstanceRequest struct {
	Name                *string `json:"name,omitempty"`
	Description         *string `json:"description,omitempty"`
	DesiredRuntimeState *string `json:"desired_runtime_state,omitempty"`
}

type DBInstanceResponse struct {
	DBInstanceID        string  `json:"dbi_id"`
	Name                string  `json:"name"`
	NormalizedName      string  `json:"normalized_name"`
	Description         *string `json:"description,omitempty"`
	DesiredRuntimeState string  `json:"desired_runtime_state"`

	ResourceState *ResourceStateResponse `json:"resource_state,omitempty"`

	Tags []TagResponse `json:"tags,omitempty"`
}

type DBInstanceListResponse struct {
	ProjectID   string               `json:"project_id"`
	DBInstances []DBInstanceResponse `json:"dbis"`
}

type DBInstanceConnParamsResponse struct {
	Host             string `json:"host"`
	Port             int    `json:"port"`
	User             string `json:"user"`
	PasswordSecretID string `json:"password_secret_id"`
	DatabaseName     string `json:"database_name"`
}
