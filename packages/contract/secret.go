package contract

import "time"

type CreateSecretRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	SecretValue string  `json:"secret_value"`
	PayloadKind string  `json:"payload_kind"`
}

type CreateSecretVersionRequest struct {
	SecretValue string `json:"secret_value"`
	PayloadKind string `json:"payload_kind,omitempty"`
}

type UpdateSecretRequest struct {
	Description string `json:"description"`
}

type SecretListItem struct {
	SecretID           string    `json:"secret_id"`
	Name               string    `json:"name"`
	Description        *string   `json:"description,omitempty"`
	PayloadKind        string    `json:"payload_kind"`
	ProtectionClass    string    `json:"protection_class"`
	CurrentVersionNo   int       `json:"current_version_no"`
	CreatedBySubjectID string    `json:"created_by_subject_id"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type SecretPasswordVerifierResponse struct {
	PasswordDesiredVersion int       `json:"password_desired_version"`
	PasswordDesiredState   string    `json:"password_desired_state"`
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`
}

type SecretResponse struct {
	ProjectID          string     `json:"project_id"`
	SecretID           string     `json:"secret_id"`
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

	PasswordVerifier *SecretPasswordVerifierResponse `json:"password_verifier,omitempty"`
}

type SecretListResponse struct {
	ProjectID string           `json:"project_id"`
	Secrets   []SecretListItem `json:"secrets"`
}

type SecretVersionListItem struct {
	VersionNo          int       `json:"version_no"`
	State              string    `json:"state"`
	PayloadKind        string    `json:"payload_kind"`
	CreatedBySubjectID string    `json:"created_by_subject_id"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
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
	ProjectID string                  `json:"project_id"`
	SecretID  string                  `json:"secret_id"`
	Versions  []SecretVersionListItem `json:"versions"`
}

type RevealSecretResponse struct {
	ProjectID   string `json:"project_id"`
	SecretID    string `json:"secret_id"`
	VersionNo   int    `json:"version_no"`
	PayloadKind string `json:"payload_kind"`
	Value       string `json:"value"`
}

type ApplySecretPasswordVerifierResponse struct {
	ProjectID    string `json:"project_id"`
	SecretID     string `json:"secret_id"`
	VersionNo    int    `json:"version_no"`
	DBInstanceID string `json:"dbi_id"`
}
