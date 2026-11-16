package auth

// ClientPolicy is the public database projection of a registered client.
type ClientPolicy struct {
	ClientID               string              `json:"client_id"`
	Name                   string              `json:"name"`
	Enabled                bool                `json:"enabled"`
	Type                   string              `json:"type"`
	AccessAudience         string              `json:"access_audience"`
	ServiceActor           string              `json:"service_actor"`
	GrantTypes             []string            `json:"grant_types"`
	RedirectURIs           []string            `json:"redirect_uris"`
	OIDCScopes             []string            `json:"oidc_scopes"`
	DelegationPolicies     map[string][]string `json:"delegation_policies"`
	IntrospectionAudiences []string            `json:"introspection_audiences"`
	CanAttest              bool                `json:"can_attest"`
	AttestationConsumeURL  string              `json:"attestation_consume_url,omitempty"`

	SecretEnv            string `json:"secret_env,omitempty"`	// Env var name
	AttestationSecretEnv string `json:"attestation_secret_env,omitempty"`	// Env var name
}
