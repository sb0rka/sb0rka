package contract

import "time"

type SecretResponse struct {
	ResourceID  string     `json:"resource_id"`
	Name        string     `json:"name"`
	Description *string    `json:"description,omitempty"`
	RevealedAt  *time.Time `json:"revealed_at,omitempty"`
}

type SecretListResponse struct {
	Secrets []SecretResponse `json:"secrets"`
}

type CreateSecretRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	SecretValue string  `json:"secret_value"`
}

type UpdateSecretValueRequest struct {
	SecretValue string `json:"secret_value"`
}
