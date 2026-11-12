package config

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"slices"
	"strings"

	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
)

const (
	GrantExchange   = "urn:ietf:params:oauth:grant-type:token-exchange"
	GrantDelegation = "urn:sb0rka:params:oauth:grant-type:delegation"
	GrantAgent      = "urn:sb0rka:params:oauth:grant-type:agent"
)

// delegationAudienceScopes is the only set of audiences a client may request
// through token exchange.
var delegationAudienceScopes = map[string][]string{
	coreauth.AudienceAPI: {
		coreauth.ScopeProjectsRead,
		coreauth.ScopeResourcesRead,
		coreauth.ScopeSecretsCreate,
		coreauth.ScopeSecretsWrite,
		coreauth.ScopeSecretsRead,
		coreauth.ScopeSecretsReveal,
	},
	coreauth.AudienceIRGateway: {coreauth.ScopeIRGatewayUse},
}

type ClientRegistry struct {
	SchemaVersion int                `json:"schema_version"`
	Revision      int64              `json:"revision"`
	Clients       []RegisteredClient `json:"clients"`
	Digest        string             `json:"-"`
}

// SkippedClient is a confidential client left out of the registry because its
// secret env var is unset. Auth still starts for the clients that are configured.
type SkippedClient struct {
	ClientID  string
	SecretEnv string
}

type RegisteredClient struct {
	ClientID               string              `json:"client_id"`
	Name                   string              `json:"name"`
	Enabled                *bool               `json:"enabled"`
	Type                   string              `json:"type"`
	AuthMethod             string              `json:"token_endpoint_auth_method"`
	GrantTypes             []string            `json:"grant_types"`
	RedirectURIs           []string            `json:"redirect_uris,omitempty"`
	OIDCScopes             []string            `json:"oidc_scopes,omitempty"`
	AccessAudience         string              `json:"access_audience,omitempty"`
	ServiceActor           string              `json:"service_actor,omitempty"`
	DelegationPolicies     map[string][]string `json:"delegation_policies,omitempty"`
	IntrospectionAudiences []string            `json:"introspection_audiences,omitempty"`
	Attestation            *AttestationConfig  `json:"attestation,omitempty"`
	Secrets                [][]byte            `json:"-"`
}

type AttestationConfig struct {
	ConsumeURL string `json:"consume_url"`
	Secret     []byte `json:"-"`
}

func (r ClientRegistry) Clone() ClientRegistry {
	r.Clients = slices.Clone(r.Clients)
	for index := range r.Clients {
		c := &r.Clients[index]
		c.GrantTypes = slices.Clone(c.GrantTypes)
		c.RedirectURIs = slices.Clone(c.RedirectURIs)
		c.OIDCScopes = slices.Clone(c.OIDCScopes)
		c.IntrospectionAudiences = slices.Clone(c.IntrospectionAudiences)
		policies := make(map[string][]string, len(c.DelegationPolicies))
		for audience, scopes := range c.DelegationPolicies {
			policies[audience] = slices.Clone(scopes)
		}
		c.DelegationPolicies = policies
		c.Secrets = slices.Clone(c.Secrets)
		for i := range c.Secrets {
			c.Secrets[i] = bytes.Clone(c.Secrets[i])
		}
		if c.Enabled != nil {
			enabled := *c.Enabled
			c.Enabled = &enabled
		}
		if c.Attestation != nil {
			value := *c.Attestation
			value.Secret = bytes.Clone(value.Secret)
			c.Attestation = &value
		}
	}
	return r
}

func (r ClientRegistry) Client(id string) (RegisteredClient, bool) {
	for _, c := range r.Clients {
		if c.ClientID == id && c.active() {
			return c, true
		}
	}
	return RegisteredClient{}, false
}

func (c RegisteredClient) Authenticate(secret string) bool {
	match := 0
	for _, expected := range c.Secrets {
		got, want := sha256.Sum256([]byte(secret)), sha256.Sum256(expected)
		match |= subtle.ConstantTimeCompare(got[:], want[:])
	}
	return c.active() && c.Type == "confidential" && match == 1
}

func (c RegisteredClient) active() bool {
	return c.Enabled != nil && *c.Enabled
}

// RegistryFromPolicies builds the runtime registry from platform_clients.
// A confidential client is included only when every secret env it names is set.
// Internal clients have no secret and are always included.
func RegistryFromPolicies(
	policies []coreauth.ClientPolicy,
	allowHTTP bool,
	lookup func(string) (string, bool),
) (ClientRegistry, []SkippedClient, error) {
	if lookup == nil {
		lookup = os.LookupEnv
	}
	var registry ClientRegistry
	registry.SchemaVersion = 1
	registry.Revision = 1
	var skipped []SkippedClient
	for _, policy := range policies {
		client, skip, err := clientFromPolicy(policy, lookup)
		if err != nil {
			return ClientRegistry{}, nil, err
		}
		if skip != nil {
			skipped = append(skipped, *skip)
			continue
		}
		registry.Clients = append(registry.Clients, client)
	}
	registry, err := validateRegistry(registry, allowHTTP)
	if err != nil {
		return ClientRegistry{}, nil, err
	}
	return registry, skipped, nil
}

func clientFromPolicy(policy coreauth.ClientPolicy, lookup func(string) (string, bool)) (RegisteredClient, *SkippedClient, error) {
	enabled := policy.Enabled
	client := RegisteredClient{
		ClientID:               policy.ClientID,
		Name:                   policy.Name,
		Enabled:                &enabled,
		Type:                   policy.Type,
		GrantTypes:             append([]string(nil), policy.GrantTypes...),
		RedirectURIs:           append([]string(nil), policy.RedirectURIs...),
		OIDCScopes:             append([]string(nil), policy.OIDCScopes...),
		AccessAudience:         policy.AccessAudience,
		ServiceActor:           policy.ServiceActor,
		IntrospectionAudiences: append([]string(nil), policy.IntrospectionAudiences...),
	}
	if len(policy.DelegationPolicies) > 0 {
		copied := make(map[string][]string, len(policy.DelegationPolicies))
		for audience, scopes := range policy.DelegationPolicies {
			copied[audience] = append([]string(nil), scopes...)
		}
		client.DelegationPolicies = copied
	}
	switch policy.Type {
	case "internal":
		if policy.SecretEnv != "" || policy.AttestationSecretEnv != "" {
			return RegisteredClient{}, nil, fmt.Errorf("internal client %s cannot declare a secret env", policy.ClientID)
		}
		client.AuthMethod = "none"
		return client, nil, nil
	case "confidential":
		client.AuthMethod = "client_secret_basic"
	default:
		return RegisteredClient{}, nil, fmt.Errorf("invalid type for client %s", policy.ClientID)
	}
	if policy.SecretEnv == "" {
		return RegisteredClient{}, &SkippedClient{ClientID: policy.ClientID}, nil
	}
	secret, ok, err := envSecret(policy.SecretEnv, lookup)
	if err != nil {
		return RegisteredClient{}, nil, fmt.Errorf("client %s: %w", policy.ClientID, err)
	}
	if !ok {
		return RegisteredClient{}, &SkippedClient{ClientID: policy.ClientID, SecretEnv: policy.SecretEnv}, nil
	}
	client.Secrets = [][]byte{secret}
	needsAttestation := policy.CanAttest || policy.AttestationConsumeURL != "" || policy.AttestationSecretEnv != ""
	if !needsAttestation {
		return client, nil, nil
	}
	if policy.AttestationSecretEnv == "" {
		return RegisteredClient{}, &SkippedClient{ClientID: policy.ClientID}, nil
	}
	attest, ok, err := envSecret(policy.AttestationSecretEnv, lookup)
	if err != nil {
		return RegisteredClient{}, nil, fmt.Errorf("client %s: %w", policy.ClientID, err)
	}
	if !ok {
		return RegisteredClient{}, &SkippedClient{ClientID: policy.ClientID, SecretEnv: policy.AttestationSecretEnv}, nil
	}
	client.Attestation = &AttestationConfig{ConsumeURL: policy.AttestationConsumeURL, Secret: attest}
	return client, nil, nil
}

func envSecret(name string, lookup func(string) (string, bool)) ([]byte, bool, error) {
	if !validSecretEnvName(name) {
		return nil, false, fmt.Errorf("invalid secret env %q", name)
	}
	raw, ok := lookup(name)
	raw = strings.TrimSpace(raw)
	if !ok || raw == "" {
		return nil, false, nil
	}
	if len(raw) < minimumOIDCClientSecretLen {
		return nil, false, fmt.Errorf("%s must contain at least %d bytes", name, minimumOIDCClientSecretLen)
	}
	return []byte(raw), true, nil
}

func validSecretEnvName(name string) bool {
	if name == "" || len(name) > 128 {
		return false
	}
	for i, r := range name {
		switch {
		case r >= 'A' && r <= 'Z', r == '_':
		case r >= '0' && r <= '9' && i > 0:
		default:
			return false
		}
	}
	return true
}

func validateRegistry(registry ClientRegistry, allowHTTP bool) (ClientRegistry, error) {
	ids, credentials := map[string]bool{}, map[string]bool{}
	accessAudiences := map[string]bool{}
	for index := range registry.Clients {
		c := &registry.Clients[index]
		if c.ClientID == "" || len(c.ClientID) > maximumOIDCClientIDLen ||
			strings.TrimSpace(c.ClientID) != c.ClientID ||
			ids[c.ClientID] ||
			strings.TrimSpace(c.Name) == "" {
			return registry, errors.New("invalid or duplicate client id/name")
		}
		ids[c.ClientID] = true
		if c.Enabled == nil {
			return registry, fmt.Errorf("client %s requires enabled", c.ClientID)
		}
		if c.Type != "internal" && c.Type != "confidential" {
			return registry, fmt.Errorf("invalid type for client %s", c.ClientID)
		}
		if c.Type == "internal" {
			if c.AuthMethod != "none" || len(c.Secrets) != 0 || len(c.GrantTypes) != 0 ||
				len(c.RedirectURIs) != 0 ||
				c.ServiceActor != "" ||
				len(c.DelegationPolicies) != 0 ||
				c.Attestation != nil ||
				len(c.IntrospectionAudiences) != 0 {
				return registry, errors.New("internal clients cannot authenticate or request OAuth grants")
			}
		} else {
			if c.AuthMethod != "client_secret_basic" || len(c.Secrets) != 1 {
				return registry, errors.New("confidential clients require one client secret and client_secret_basic")
			}
			for _, secret := range c.Secrets {
				digest := sha256.Sum256(secret)
				key := hex.EncodeToString(digest[:])
				if credentials[key] {
					return registry, errors.New("client and backchannel credentials must be distinct")
				}
				credentials[key] = true
			}
		}
		seenGrants := map[string]bool{}
		for _, grant := range c.GrantTypes {
			if !slices.Contains(
				[]string{"authorization_code", "refresh_token", GrantExchange, GrantDelegation, GrantAgent},
				grant,
			) ||
				seenGrants[grant] {
				return registry, errors.New("unknown or duplicate client grant type")
			}
			seenGrants[grant] = true
		}
		if seenGrants["authorization_code"] {
			if c.AccessAudience == "" || len(c.RedirectURIs) == 0 || !slices.Contains(c.OIDCScopes, "openid") {
				return registry, errors.New("OIDC clients require access audience, redirect URIs and openid scope")
			}
		} else if len(c.RedirectURIs) != 0 || len(c.OIDCScopes) != 0 || seenGrants["refresh_token"] {
			return registry, errors.New("login settings require authorization_code")
		}
		seenRedirects := map[string]bool{}
		for _, uri := range c.RedirectURIs {
			if err := validateRedirectURI(uri); err != nil || seenRedirects[uri] {
				return registry, fmt.Errorf("invalid/duplicate redirect for %s", c.ClientID)
			}
			seenRedirects[uri] = true
		}
		seenScopes := map[string]bool{}
		for _, scope := range c.OIDCScopes {
			if !slices.Contains([]string{"openid", "profile", "email", "offline_access"}, scope) || seenScopes[scope] {
				return registry, errors.New("unknown or duplicate OIDC scope")
			}
			seenScopes[scope] = true
		}
		if seenGrants["refresh_token"] != slices.Contains(c.OIDCScopes, "offline_access") {
			return registry, errors.New("offline_access and refresh_token must be configured together")
		}
		if len(c.DelegationPolicies) > 0 &&
			(c.ServiceActor == "" || !seenGrants[GrantExchange] || !seenGrants[GrantDelegation] || !seenGrants["authorization_code"]) {
			return registry, errors.New("delegation requires a login client, actor and both delegation grant types")
		}
		if (seenGrants[GrantExchange] || seenGrants[GrantDelegation]) && len(c.DelegationPolicies) == 0 {
			return registry, errors.New("delegation grant types require target policies")
		}
		for audience, scopes := range c.DelegationPolicies {
			allowed := delegationAudienceScopes[audience]
			if len(scopes) == 0 || len(allowed) == 0 {
				return registry, errors.New("unknown or empty delegation audience policy")
			}
			seen := map[string]bool{}
			for _, scope := range scopes {
				if !slices.Contains(allowed, scope) || seen[scope] {
					return registry, errors.New("unsupported or duplicate delegation scope")
				}
				seen[scope] = true
			}
		}
		if seenGrants[GrantAgent] != (c.Attestation != nil) ||
			(c.Attestation != nil && (c.ServiceActor == "" || len(c.GrantTypes) != 1 || c.AccessAudience != "" || len(c.DelegationPolicies) != 0)) {
			return registry, errors.New("incompatible attestation client policy")
		}
		if c.Attestation != nil {
			u, err := url.Parse(c.Attestation.ConsumeURL)
			if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" ||
				(u.Scheme != "https" && !(u.Scheme == "http" && allowHTTP && isLocalDevHTTPHost(u.Hostname()))) {
				return registry, errors.New("invalid attestation consume URL")
			}
			if len(c.Attestation.Secret) < minimumOIDCClientSecretLen {
				return registry, errors.New("registry credentials require at least 32 bytes")
			}
			digest := sha256.Sum256(c.Attestation.Secret)
			key := hex.EncodeToString(digest[:])
			if credentials[key] {
				return registry, errors.New("client and backchannel credentials must be distinct")
			}
			credentials[key] = true
		}
		if err := validateClientAudiences(c, accessAudiences); err != nil {
			return registry, err
		}
	}
	if err := validateServiceActors(registry.Clients); err != nil {
		return registry, err
	}
	if err := validateIntrospectionOwners(registry.Clients); err != nil {
		return registry, err
	}
	for _, required := range []string{coreauth.ClientConsole, coreauth.ClientConsent} {
		c, ok := registry.Client(required)
		if !ok || c.Type != "internal" || c.AccessAudience != coreauth.AudienceAPI {
			return registry, fmt.Errorf("missing internal API client %s", required)
		}
	}
	// Include credential fingerprints so replicas cannot silently run different
	// secret material under the same revision. No credential reaches the projection.
	canonical, _ := json.Marshal(registry)
	digest := sha256.New()
	digest.Write(canonical)
	for _, c := range registry.Clients {
		for _, secret := range c.Secrets {
			sum := sha256.Sum256(secret)
			digest.Write(sum[:])
		}
		if c.Attestation != nil {
			sum := sha256.Sum256(c.Attestation.Secret)
			digest.Write(sum[:])
		}
	}
	registry.Digest = hex.EncodeToString(digest.Sum(nil))
	return registry, nil
}

func validateClientAudiences(c *RegisteredClient, accessAudiences map[string]bool) error {
	switch c.Type {
	case "internal":
		if c.AccessAudience != coreauth.AudienceAPI {
			return fmt.Errorf("internal client %s must use the API audience", c.ClientID)
		}
	default:
		if c.AccessAudience != "" {
			if c.AccessAudience != coreauth.AudienceSOM && c.AccessAudience != coreauth.AudienceIR {
				return fmt.Errorf("unsupported access audience for %s", c.ClientID)
			}
			if accessAudiences[c.AccessAudience] {
				return fmt.Errorf("access audience %s is already registered", c.AccessAudience)
			}
			accessAudiences[c.AccessAudience] = true
		}
	}
	if len(c.IntrospectionAudiences) > 1 {
		return errors.New("introspection clients must have exactly one protected-resource audience")
	}
	for _, audience := range c.IntrospectionAudiences {
		if audience != coreauth.AudienceSOM && audience != coreauth.AudienceIR && audience != coreauth.AudienceIRGateway {
			return fmt.Errorf("unsupported introspection audience for %s", c.ClientID)
		}
		if c.Type != "confidential" {
			return fmt.Errorf("introspection audience %s is not issued by %s", audience, c.ClientID)
		}
	}
	return nil
}

func validateServiceActors(clients []RegisteredClient) error {
	type actorUse struct {
		delegation string
		other      string
	}
	uses := map[string]*actorUse{}
	for _, c := range clients {
		if c.ServiceActor == "" {
			continue
		}
		if !validServiceActor(c.ServiceActor) {
			return fmt.Errorf("invalid service actor for %s", c.ClientID)
		}
		use := uses[c.ServiceActor]
		if use == nil {
			use = &actorUse{}
			uses[c.ServiceActor] = use
		}
		switch {
		case len(c.DelegationPolicies) > 0:
			if use.delegation != "" {
				return fmt.Errorf("service actor %s is shared by delegation clients", c.ServiceActor)
			}
			use.delegation = c.ClientID
		case c.Attestation != nil:
		default:
			use.other = c.ClientID
		}
	}
	for actor, use := range uses {
		if use.delegation != "" && use.other != "" {
			return fmt.Errorf("service actor %s cannot be shared with %s", actor, use.other)
		}
	}
	return nil
}

func validateIntrospectionOwners(clients []RegisteredClient) error {
	loginAudiences := map[string]bool{}
	for _, c := range clients {
		if c.Type != "internal" && c.AccessAudience != "" {
			loginAudiences[c.AccessAudience] = true
		}
	}
	for _, c := range clients {
		for _, audience := range c.IntrospectionAudiences {
			owns := audience == c.AccessAudience || len(c.DelegationPolicies[audience]) > 0
			resourceClient := c.AccessAudience == "" && len(c.DelegationPolicies) == 0 && len(c.GrantTypes) == 0
			if owns || (resourceClient && !loginAudiences[audience]) {
				continue
			}
			return fmt.Errorf("introspection audience %s is not issued by %s", audience, c.ClientID)
		}
	}
	return nil
}

func validServiceActor(name string) bool {
	if name == "" || len(name) > 64 {
		return false
	}
	for _, r := range name {
		if (r < 'a' || r > 'z') && (r < '0' || r > '9') && r != '-' {
			return false
		}
	}
	return true
}
