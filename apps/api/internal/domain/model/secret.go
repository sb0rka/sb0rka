package model

import (
	"time"

	"github.com/google/uuid"
)

const (
	SecretPayloadKindText   = "text"
	SecretPayloadKindJSON   = "json"
	SecretPayloadKindBinary = "binary"

	SecretProtectionClassServerManaged = "server_managed"

	SecretVersionStateActive   = "active"
	SecretVersionStateDisabled = "disabled"

	CryptoProviderTinkAEAD          = "tink_aead"
	CryptoEnvelopeVersionTinkAEADV1 = "sb0rka.tink-aead.v1"

	EncryptionKeyStatusActive    = "active"
	EncryptionKeyStatusDisabled  = "disabled"
	EncryptionKeyStatusDestroyed = "destroyed"
)

type SecretPasswordVerifierMeta struct {
	PasswordDesiredVersion int       `json:"password_desired_version"`
	PasswordDesiredState   string    `json:"password_desired_state"`
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`
}

type Secret struct {
	ProjectID          string     `json:"project_id"`
	ResourceID         string     `json:"resource_id"`
	Name               string     `json:"name"`
	Description        *string    `json:"description,omitempty"`
	PayloadKind        string     `json:"payload_kind"`
	ProtectionClass    string     `json:"protection_class"`
	CurrentVersionNo   int        `json:"current_version_no"`
	CreatedBySubjectID uuid.UUID  `json:"created_by_subject_id"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	ScheduledDestroyAt *time.Time `json:"scheduled_destroy_at,omitempty"`

	ResourceState *ResourceState `json:"resource_state,omitempty"`

	Tags []Tag `json:"tags,omitempty"`

	PasswordVerifier *SecretPasswordVerifierMeta `json:"password_verifier,omitempty"`
}

type SecretVersion struct {
	ProjectID          string     `json:"project_id"`
	SecretID           string     `json:"secret_id"`
	VersionNo          int        `json:"version_no"`
	State              string     `json:"state"`
	PayloadKind        string     `json:"payload_kind"`
	CreatedBySubjectID uuid.UUID  `json:"created_by_subject_id"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	DisabledAt         *time.Time `json:"disabled_at,omitempty"`
}

type SecretMaterial struct {
	ProjectID              string    `json:"project_id"`
	SecretID               string    `json:"secret_id"`
	VersionNo              int       `json:"version_no"`
	EncryptionKeyID        uuid.UUID `json:"encryption_key_id"`
	CryptoProvider         string    `json:"crypto_provider"`
	CryptoEnvelopeVersion  string    `json:"crypto_envelope_version"`
	ContentAlgorithm       string    `json:"content_algorithm"`
	AADContext             []byte    `json:"aad_context"`
	EncryptedMessage       []byte    `json:"encrypted_message"`
	EncryptionKeyProvider  string    `json:"encryption_key_provider,omitempty"`
	EncryptionKeyRef       string    `json:"encryption_key_ref,omitempty"`
	EncryptionKeyAlgorithm string    `json:"encryption_key_algorithm,omitempty"`
}

type EncryptionKey struct {
	ID        uuid.UUID  `json:"id"`
	Provider  string     `json:"provider"`
	KeyRef    string     `json:"key_ref"`
	Algorithm string     `json:"algorithm"`
	Status    string     `json:"status"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
	RotatedAt *time.Time `json:"rotated_at,omitempty"`
}
