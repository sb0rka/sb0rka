package auth

// IntrospectionResponse is the restricted resource-server view of an access
// token. An inactive response intentionally discloses no token metadata.
type IntrospectionResponse struct {
	Active            bool     `json:"active"`
	Subject           string   `json:"sub,omitempty"`
	ClientID          string   `json:"client_id,omitempty"`
	Audience          string   `json:"aud,omitempty"`
	SessionID         string   `json:"sid,omitempty"`
	SubjectKind       string   `json:"sk,omitempty"`
	Exp               int64    `json:"exp,omitempty"`
	SessionExpiresAt  int64    `json:"session_expires_at,omitempty"`
	Actor             string   `json:"actor_subject_id,omitempty"`
	Scope             string   `json:"scope,omitempty"`
	DelegationID      string   `json:"delegation_id,omitempty"`
	DelegationVersion int64    `json:"delegation_version,omitempty"`
	ProjectIDs        []string `json:"project_ids,omitempty"`
}
