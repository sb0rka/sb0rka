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
}

type DatabaseListResponse struct {
	Databases []DatabaseResponse `json:"databases"`
}
