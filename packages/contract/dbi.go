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
	PublicID            string  `json:"public_id"`
	DBInstanceID        string  `json:"dbi_id" format:"uuid"`
	Name                string  `json:"name"`
	NormalizedName      string  `json:"normalized_name"`
	Description         *string `json:"description,omitempty"`
	DesiredRuntimeState string  `json:"desired_runtime_state"`

	ResourceState *ResourceStateResponse `json:"resource_state,omitempty"`

	Tags []TagResponse `json:"tags,omitempty"`
}

type DBInstanceListResponse struct {
	ProjectID   string               `json:"project_id" format:"uuid"`
	DBInstances []DBInstanceResponse `json:"dbis"`
}

type DBInstanceConnParamsResponse struct {
	Host                   string `json:"host"`
	Port                   int    `json:"port"`
	User                   string `json:"user"`
	PasswordSecretID       string `json:"password_secret_id" format:"uuid"`
	PasswordSecretPublicID string `json:"password_secret_public_id"`
	DatabaseName           string `json:"database_name"`
}
