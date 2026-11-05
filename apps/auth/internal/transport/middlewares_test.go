package transport

import (
	"crypto/ed25519"
	"crypto/rand"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	"github.com/sb0rka/sb0rka/apps/auth/internal/service"
	"github.com/sb0rka/sb0rka/apps/auth/internal/transport/runtime"
	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"
)

func testAuthConfig(t *testing.T) config.AuthConfig {
	t.Helper()
	_, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return config.AuthConfig{
		AccessTokenPrivateKey: privateKey,
		AccessTokenKid:        "test-kid",
		AccessTokenIssuer:     "https://auth.sb0rka.internal",
		AccessTokenAudience:   coreauth.AudienceAPI,
		AccessTokenTTL:        5 * time.Minute,
	}
}

func testRegistry() config.ClientRegistry {
	enabled := true
	return config.ClientRegistry{Clients: []config.RegisteredClient{
		{
			ClientID:       coreauth.ClientConsole,
			Name:           "Console",
			Enabled:        &enabled,
			Type:           "internal",
			AccessAudience: coreauth.AudienceAPI,
		},
		{
			ClientID:       coreauth.ClientConsent,
			Name:           "Consent",
			Enabled:        &enabled,
			Type:           "internal",
			AccessAudience: coreauth.AudienceAPI,
		},
	}}
}

func TestAuthMiddlewareRejectsDelegatedToken(t *testing.T) {
	authCfg := testAuthConfig(t)
	server := &Server{deps: runtime.Dependencies{
		Cfg: config.ServerConfig{
			AuthConfig: authCfg,
			OIDC:       &config.OIDCConfig{Registry: testRegistry()},
		},
		Log: slog.New(slog.DiscardHandler),
	}}
	var seen authctx.Identity
	var reached bool
	handler := server.authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		identity, ok := authctx.IdentityFromContext(r.Context())
		if !ok {
			t.Fatal("missing identity")
		}
		seen = identity
		reached = true
		w.WriteHeader(http.StatusNoContent)
	}))

	consoleToken, err := service.CreateAccessToken(uuid.New(), uuid.New(), coreauth.SubjectUser, authCfg)
	if err != nil {
		t.Fatal(err)
	}
	console := httptest.NewRequest(http.MethodGet, "/auth/sessions", nil)
	console.Header.Set("Authorization", "Bearer "+consoleToken)
	consoleResponse := httptest.NewRecorder()
	handler.ServeHTTP(consoleResponse, console)
	if consoleResponse.Code != http.StatusNoContent || !reached {
		t.Fatalf("console token status=%d reached=%v", consoleResponse.Code, reached)
	}
	if seen.ClientID != coreauth.ClientConsole || seen.ActorSubjectID != "" || seen.Scope != "" {
		t.Fatalf("console identity = %+v", seen)
	}

	reached = false
	delegated := httptest.NewRequest(http.MethodDelete, "/auth/sessions", nil)
	delegated.Header.Set("Authorization", "Bearer "+signDelegatedToken(t, authCfg))
	delegatedResponse := httptest.NewRecorder()
	handler.ServeHTTP(delegatedResponse, delegated)
	if delegatedResponse.Code != http.StatusForbidden || reached {
		t.Fatalf("delegated token status=%d reached=%v", delegatedResponse.Code, reached)
	}
}

func signDelegatedToken(t *testing.T, authCfg config.AuthConfig) string {
	t.Helper()
	now := time.Now().UTC()
	claims := service.AccessTokenClaims{
		SessionID:         uuid.NewString(),
		SubjectKind:       coreauth.SubjectUser,
		ClientID:          coreauth.ClientIRWeb,
		Actor:             &coreauth.Actor{SubjectID: uuid.NewString()},
		Scope:             coreauth.ScopeProjectsRead,
		DelegationID:      uuid.NewString(),
		DelegationVersion: 1,
		ProjectIDs:        []string{uuid.NewString()},
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   uuid.NewString(),
			Issuer:    authCfg.AccessTokenIssuer,
			Audience:  jwt.ClaimStrings{coreauth.AudienceAPI},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Minute)),
			ID:        uuid.NewString(),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = authCfg.AccessTokenKid
	token.Header["typ"] = coreauth.AccessTokenType
	signed, err := token.SignedString(authCfg.AccessTokenPrivateKey)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}
