package contract

import "time"

type CreateSecretRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	Value       string  `json:"value"`
	PayloadKind string  `json:"payload_kind,omitempty"`
}

type CreateSecretVersionRequest struct {
	Value       string `json:"value"`
	PayloadKind string `json:"payload_kind,omitempty"`
}

type UpdateSecretVersionRequest struct {
	State string `json:"state"`
}

type UpdateSecretRequest struct {
	Description string `json:"description"`
}

type SecretResponse struct {
	ProjectID          string     `json:"project_id"`
	ResourceID         string     `json:"resource_id"`
	Name               string     `json:"name"`
	Description        *string    `json:"description,omitempty"`
	PayloadKind        string     `json:"payload_kind"`
	ProtectionClass    string     `json:"protection_class"`
	CurrentVersionNo   int        `json:"current_version_no"`
	CreatedBySubjectID string     `json:"created_by_subject_id"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	ScheduledDestroyAt *time.Time `json:"scheduled_destroy_at,omitempty"`

	ResourceState *ResourceStateResponse `json:"resource_state,omitempty"`

	Tags []TagResponse `json:"tags,omitempty"`
}

type SecretListResponse struct {
	Secrets []SecretResponse `json:"secrets"`
}

type SecretVersionResponse struct {
	ProjectID          string     `json:"project_id"`
	SecretID           string     `json:"secret_id"`
	VersionNo          int        `json:"version_no"`
	State              string     `json:"state"`
	PayloadKind        string     `json:"payload_kind"`
	CreatedBySubjectID string     `json:"created_by_subject_id"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	DisabledAt         *time.Time `json:"disabled_at,omitempty"`
}

type SecretVersionListResponse struct {
	Versions []SecretVersionResponse `json:"versions"`
}

type RevealSecretResponse struct {
	ProjectID   string `json:"project_id"`
	SecretID    string `json:"secret_id"`
	VersionNo   int    `json:"version_no"`
	PayloadKind string `json:"payload_kind"`
	Value       string `json:"value"`
}
