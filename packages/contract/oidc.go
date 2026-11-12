package contract

type OIDCDiscoveryResponse struct {
	IntrospectionEndpoint            string   `json:"introspection_endpoint"`
	IntrospectionEndpointAuthMethods []string `json:"introspection_endpoint_auth_methods_supported"`
	Issuer                           string   `json:"issuer"`
	AuthorizationEndpoint            string   `json:"authorization_endpoint"`
	TokenEndpoint                    string   `json:"token_endpoint"`
	RevocationEndpoint               string   `json:"revocation_endpoint"`
	JWKSURI                          string   `json:"jwks_uri"`
	ResponseTypesSupported           []string `json:"response_types_supported"`
	ResponseModesSupported           []string `json:"response_modes_supported"`
	GrantTypesSupported              []string `json:"grant_types_supported"`
	SubjectTypesSupported            []string `json:"subject_types_supported"`
	IDTokenSigningAlgorithms         []string `json:"id_token_signing_alg_values_supported"`
	TokenEndpointAuthMethods         []string `json:"token_endpoint_auth_methods_supported"`
	CodeChallengeMethodsSupported    []string `json:"code_challenge_methods_supported"`
	ScopesSupported                  []string `json:"scopes_supported"`
	ClaimsSupported                  []string `json:"claims_supported"`
}

type OIDCJWKSResponse struct {
	Keys []OIDCJWKResponse `json:"keys"`
}

type OIDCJWKResponse struct {
	CRV string `json:"crv,omitempty"`
	X   string `json:"x,omitempty"`
	KTY string `json:"kty"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	KID string `json:"kid"`
	N   string `json:"n,omitempty"`
	E   string `json:"e,omitempty"`
}

type OIDCContinuationResponse struct {
	RedirectTo string `json:"redirect_to"`
}

type OAuthErrorResponse struct {
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description,omitempty"`
}

type OAuthTokenResponse struct {
	IssuedTokenType string `json:"issued_token_type,omitempty"`
	AccessToken     string `json:"access_token"`
	RefreshToken    string `json:"refresh_token,omitempty"`
	TokenType       string `json:"token_type"`
	ExpiresIn       int64  `json:"expires_in"`
	IDToken         string `json:"id_token,omitempty"`
	Scope           string `json:"scope"`
}
