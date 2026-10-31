package contract

import "time"

type CreateSecretRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	SecretValue string  `json:"secret_value"`
	PayloadKind string  `json:"payload_kind" enums:"text,json,binary"`
	Purpose     string  `json:"purpose,omitempty"`
}

type CreateSecretVersionRequest struct {
	SecretValue string `json:"secret_value"`
}

type UpdateSecretRequest struct {
	Description *string `json:"description,omitempty"`
}

type UpdateSecretModelsRequest struct {
	Models []string `json:"models" format:"uuid" binding:"required"`
}

type SecretModelsResponse struct {
	SecretID       string             `json:"secret_id" format:"uuid"`
	SecretPublicID string             `json:"public_id"`
	Models         []LLMModelResponse `json:"models"`
}

type UpdateSecretModelsResponse struct {
	SecretID       string   `json:"secret_id" format:"uuid"`
	SecretPublicID string   `json:"public_id"`
	Models         []string `json:"models" format:"uuid"`
}

type CreateSecretResponse struct {
	SecretResponse
}

type SecretListItem struct {
	PublicID           string    `json:"public_id"`
	SecretID           string    `json:"secret_id" format:"uuid"`
	Name               string    `json:"name"`
	Description        *string   `json:"description,omitempty"`
	PayloadKind        string    `json:"payload_kind"`
	ProtectionClass    string    `json:"protection_class"`
	CurrentVersionNo   int32     `json:"current_version_no" format:"int32"`
	CreatedBySubjectID string    `json:"created_by_subject_id" format:"uuid"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type SecretPasswordVerifierResponse struct {
	PasswordDesiredVersion int32     `json:"password_desired_version" format:"int32"`
	PasswordDesiredState   string    `json:"password_desired_state"`
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`
}

type SecretResponse struct {
	PublicID           string     `json:"public_id"`
	ProjectID          string     `json:"project_id" format:"uuid"`
	SecretID           string     `json:"secret_id" format:"uuid"`
	Name               string     `json:"name"`
	Description        *string    `json:"description,omitempty"`
	PayloadKind        string     `json:"payload_kind"`
	ProtectionClass    string     `json:"protection_class"`
	CurrentVersionNo   int32      `json:"current_version_no" format:"int32"`
	CreatedBySubjectID string     `json:"created_by_subject_id" format:"uuid"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	ScheduledDestroyAt *time.Time `json:"scheduled_destroy_at,omitempty"`

	ResourceState *ResourceStateResponse `json:"resource_state,omitempty"`

	Tags []TagResponse `json:"tags,omitempty"`

	PasswordVerifier *SecretPasswordVerifierResponse `json:"password_verifier,omitempty"`
	Versions         []SecretVersionResponse         `json:"versions,omitempty"`
}

type SecretListResponse struct {
	ProjectID string           `json:"project_id" format:"uuid"`
	Secrets   []SecretListItem `json:"secrets"`
}

type SecretVersionListItem struct {
	VersionNo          int32     `json:"version_no" format:"int32"`
	State              string    `json:"state"`
	CreatedBySubjectID string    `json:"created_by_subject_id" format:"uuid"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type SecretVersionResponse struct {
	ProjectID          string                       `json:"project_id" format:"uuid"`
	SecretID           string                       `json:"secret_id" format:"uuid"`
	VersionNo          int32                        `json:"version_no" format:"int32"`
	State              string                       `json:"state"`
	CreatedBySubjectID string                       `json:"created_by_subject_id" format:"uuid"`
	CreatedAt          time.Time                    `json:"created_at"`
	UpdatedAt          time.Time                    `json:"updated_at"`
	DisabledAt         *time.Time                   `json:"disabled_at,omitempty"`
	Digest             *SecretVersionDigestResponse `json:"digest,omitempty"`
}

type SecretVersionDigestResponse struct {
	DigestAlg string    `json:"digest_alg"`
	Prefix    string    `json:"prefix" minLength:"14" maxLength:"14"`
	Postfix   string    `json:"postfix" minLength:"3" maxLength:"3"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type SecretVersionListResponse struct {
	ProjectID string                  `json:"project_id" format:"uuid"`
	SecretID  string                  `json:"secret_id" format:"uuid"`
	Versions  []SecretVersionListItem `json:"versions"`
}

type RevealSecretResponse struct {
	ProjectID   string `json:"project_id" format:"uuid"`
	SecretID    string `json:"secret_id" format:"uuid"`
	VersionNo   int32  `json:"version_no" format:"int32"`
	PayloadKind string `json:"payload_kind"`
	Value       string `json:"value"`
}

type ApplySecretPasswordVerifierResponse struct {
	ProjectID    string `json:"project_id" format:"uuid"`
	SecretID     string `json:"secret_id" format:"uuid"`
	VersionNo    int32  `json:"version_no" format:"int32"`
	DBInstanceID string `json:"dbi_id" format:"uuid"`
}
