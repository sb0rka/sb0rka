package auth

import "time"

// Access token profile shared by Auth and every resource server.
const (
	AccessTokenType          = "at+jwt"
	DefaultAccessTokenTTL    = 300 * time.Second
	DefaultMaxAccessTokenTTL = 600 * time.Second
	DefaultAccessTokenSkew   = 30 * time.Second
	ClockSkew                = DefaultAccessTokenSkew
	MaxAccessTokenTTL        = DefaultMaxAccessTokenTTL
)

// OAuth client identifiers registered by Auth.
const (
	ClientSOMWeb      = "sb0rka-som-web"
	ClientSOMWorkload = "sb0rka-som-workload"
	ClientConsole     = "sb0rka-console"
	ClientConsent     = "sb0rka-consent"
	ClientIRWeb       = "sb0rka-ir-web"
	ClientIRGateway   = "sb0rka-ir-gateway"
)

// Access token audiences, one per resource server.
const (
	AudienceAPI       = "sb0rka-api"
	AudienceSOM       = "sb0rka-som"
	AudienceRelay     = "sb0rka-relay"
	AudienceIR        = "sb0rka-ir"
	AudienceIRGateway = "sb0rka-ir-gateway"
)

// Scopes granted to delegated and workload tokens.
const (
	ScopeRelayConnect  = "relay.connect"
	ScopeProjectsRead  = "projects.read"
	ScopeResourcesRead = "resources.read"
	ScopeSecretsCreate = "secrets.create"
	ScopeSecretsWrite  = "secrets.write"
	ScopeIRGatewayUse  = "ir.gateway.use"

	// AgentAPIScope is the only scope set an agent token for the platform API may carry.
	AgentAPIScope = ScopeSecretsCreate + " " + ScopeSecretsWrite
)

// Subject kinds carried in the sk claim.
const (
	SubjectUser  = "user"
	SubjectAgent = "agent"
)
