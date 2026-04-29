package contract

import "time"

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
	Resources []ResourceResponse `json:"resources"`
}

type DatabaseWithSecretResponse struct {
	Database DatabaseResponse `json:"database"`
	Secret   SecretResponse   `json:"secret"`
}
