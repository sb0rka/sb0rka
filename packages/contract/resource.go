package contract

import "time"

type ResourceResponse struct {
	ID           string    `json:"id"`
	ProjectID    string    `json:"project_id"`
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
