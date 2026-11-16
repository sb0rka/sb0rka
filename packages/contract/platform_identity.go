package contract

import "github.com/google/uuid"

type DelegationRequestResponse struct {
	AuthorizeURL string `json:"authorize_url"`
}
type DelegationConsentProject struct {
	PublicID string `json:"public_id"`
	Name     string `json:"name"`
}
type DelegationConsentResponse struct {
	RequestID  uuid.UUID                  `json:"request_id"`
	ClientID   string                     `json:"client_id"`
	ClientName string                     `json:"client_name"`
	Audience   string                     `json:"audience"`
	Projects   []DelegationConsentProject `json:"projects"`
	Scopes     []string                   `json:"scopes"`
	CSRFToken  string                     `json:"csrf_token"`
}
type DelegationConsentDecision struct {
	RequestID  uuid.UUID `json:"request_id"`
	CSRFToken  string    `json:"csrf_token"`
	Decision   string    `json:"decision" enums:"approve,deny"`
	ProjectIDs []string  `json:"project_ids"`
	Scopes     []string  `json:"scopes"`
}
type DelegationStatusResponse struct {
	Connected bool `json:"connected"`
	*DelegationGrantResponse
}
type DelegationGrantResponse struct {
	ActorSubjectID uuid.UUID `json:"actor_subject_id"`
	Audience       string    `json:"audience"`
	DelegationID   uuid.UUID `json:"delegation_id"`
	Version        int64     `json:"version"`
	Scopes         []string  `json:"scopes"`
	ProjectIDs     []string  `json:"project_ids"`
}
type AgentAttestation struct {
	ID            uuid.UUID  `json:"attestation_id"`
	Purpose       string     `json:"purpose"`
	SubjectID     *uuid.UUID `json:"agent_subject_id"`
	HostID        uuid.UUID  `json:"host_id"`
	PublicKey     string     `json:"public_key_b64"`
	KeyThumbprint string     `json:"key_thumbprint"`
	VerifiedAt    int64      `json:"verified_at"`
	ExpiresAt     int64      `json:"expires_at"`
}
type ReserveAgentRequest struct {
	HostID       uuid.UUID `json:"host_id"`
	SubjectToken string    `json:"subject_token"`
}

type ReserveAgentResponse struct {
	SubjectID uuid.UUID `json:"agent_subject_id"`
}

type AgentTokenResponse struct {
	AccessToken string    `json:"access_token"`
	TokenType   string    `json:"token_type"`
	ExpiresIn   int64     `json:"expires_in"`
	SubjectID   uuid.UUID `json:"agent_subject_id"`
}
