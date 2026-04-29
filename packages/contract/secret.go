package contract

import "time"

type CreateSecretRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	SecretValue string  `json:"secret_value"`
}

type UpdateSecretValueRequest struct {
	SecretValue string `json:"secret_value"`
}

type SecretResponse struct {
	ResourceID  string     `json:"resource_id"`
	Name        string     `json:"name"`
	Description *string    `json:"description,omitempty"`
	Version     int        `json:"version"`
	RevealedAt  *time.Time `json:"revealed_at,omitempty"`

	ResourceState *ResourceStateResponse `json:"resource_state,omitempty"`

	Tags []TagResponse `json:"tags,omitempty"`
}

type SecretListResponse struct {
	Secrets []SecretResponse `json:"secrets"`
}
