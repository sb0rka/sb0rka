package contract

import "time"

type ResourceResponse struct {
	ID           int64     `json:"id"`
	ProjectID    int64     `json:"project_id"`
	IsActive     bool      `json:"is_active"`
	ResourceType string    `json:"resource_type"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type ResourceListResponse struct {
	Resources []ResourceResponse `json:"resources"`
}

type DatabaseWithSecretResponse struct {
	Database DatabaseResponse `json:"database"`
	Secret   SecretResponse   `json:"secret"`
}
