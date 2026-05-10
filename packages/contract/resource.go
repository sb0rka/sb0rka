package contract

import "time"

type ResourceListItem struct {
	ID        string    `json:"id"`
	Kind      string    `json:"kind"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type ResourceResponse struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"project_id"`
	Kind      string    `json:"kind"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	ResourceState *ResourceStateResponse `json:"resource_state,omitempty"`
}

type ResourceStateResponse struct {
	RuntimeState string    `json:"runtime_state"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type ResourceListResponse struct {
	ProjectID string             `json:"project_id"`
	Resources []ResourceListItem `json:"resources"`
}

type DatabaseWithSecretResponse struct {
	DBInstance DBInstanceResponse `json:"dbi"`
	Secret     SecretResponse     `json:"secret"`
}
