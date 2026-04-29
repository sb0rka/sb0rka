package contract

type CreateDatabaseRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
}

type UpdateDatabaseRequest struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
}

type DatabaseResponse struct {
	ResourceID     string  `json:"resource_id"`
	Name           string  `json:"name"`
	NormalizedName string  `json:"normalized_name"`
	Description    *string `json:"description,omitempty"`

	ResourceState *ResourceStateResponse `json:"resource_state,omitempty"`

	Tags []TagResponse `json:"tags,omitempty"`
}

type DatabaseListResponse struct {
	Databases []DatabaseResponse `json:"databases"`
}

type DatabaseConnParamsResponse struct {
	Host             string `json:"host"`
	Port             int    `json:"port"`
	User             string `json:"user"`
	PasswordSecretID string `json:"password_secret_id"`
	DatabaseName     string `json:"database_name"`
}
