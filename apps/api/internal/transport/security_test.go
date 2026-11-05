package transport

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/api/internal/config"
	"github.com/sb0rka/sb0rka/apps/api/internal/store"
	"github.com/sb0rka/sb0rka/apps/api/internal/transport/runtime"
	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
)

type securityDatabase struct {
	store.Database
	live, registered, delegation, bound bool
	err                                 error
}

func (d *securityDatabase) RegisteredAccessClient(context.Context, string, string) (bool, error) {
	return d.registered, d.err
}
func (d *securityDatabase) LiveDelegation(context.Context, string, int64, string, string, string, []string, []string, string) (bool, error) {
	return d.delegation, d.err
}
func (d *securityDatabase) IsLiveSession(context.Context, uuid.UUID, uuid.UUID) (bool, error) {
	return d.live, d.err
}
func (d *securityDatabase) IsLiveAgent(context.Context, uuid.UUID, uuid.UUID, string, string) (bool, error) {
	return d.live, d.err
}
func (d *securityDatabase) SecretBoundToAgent(context.Context, string, string, string) (bool, error) {
	return d.bound, d.err
}
func (d *securityDatabase) SecretBoundToUserAgent(context.Context, string, string, string, string) (bool, error) {
	return d.bound, d.err
}

func TestSecurityMiddlewareIdentities(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	issuer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []any{map[string]string{"kty": "OKP", "crv": "Ed25519", "kid": "audit", "alg": "EdDSA", "use": "sig", "x": base64.RawURLEncoding.EncodeToString(pub)}}})
	}))
	defer issuer.Close()
	cache, err := coreauth.NewJWKSCache(issuer.URL)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, kind, scope, project                               string
		allowAgent, live, registered, delegation, bound, dbError bool
		status                                                   int
	}{
		{"direct", "user", "", "", false, true, true, true, true, false, 204},
		{"unregistered_direct", "user", "", "", false, true, false, true, true, false, 403},
		{"direct_database_error", "user", "", "", false, true, true, true, true, true, 503},
		{"delegated", "delegated", "projects.read", "abcdef0123", false, true, true, true, true, false, 204},
		{"wrong_scope", "delegated", "secrets.write", "abcdef0123", false, true, true, true, true, false, 403},
		{"wrong_project", "delegated", "projects.read", "foreign", false, true, true, true, true, false, 403},
		{"revoked_grant", "delegated", "projects.read", "abcdef0123", false, true, true, false, true, false, 403},
		{"revoked_session", "delegated", "projects.read", "abcdef0123", false, false, true, true, true, false, 401},
		{"unbound_secret", "delegated", "projects.read", "abcdef0123", false, true, true, true, false, false, 403},
		{"agent", "agent", "", "abcdef0123", true, true, true, true, true, false, 204},
		{"agent_forbidden_route", "agent", "", "abcdef0123", false, true, true, true, true, false, 401},
		{"agent_revoked", "agent", "", "abcdef0123", true, false, true, true, true, false, 401},
		{"agent_unbound", "agent", "", "abcdef0123", true, true, true, true, false, false, 403},
		{"agent_database_error", "agent", "", "abcdef0123", true, true, true, true, true, true, 503},
	} {
		t.Run(tc.name, func(t *testing.T) {
			database := &securityDatabase{live: tc.live, registered: tc.registered, delegation: tc.delegation, bound: tc.bound}
			if tc.dbError {
				database.err = errors.New("fixture database unavailable")
			}
			s := &Server{deps: runtime.Dependencies{Cfg: config.ServerConfig{AuthConfig: config.AuthConfig{VerificationKeys: cache, AccessTokenIssuer: issuer.URL, AccessTokenAudience: coreauth.AudienceAPI}}, PlatformDatabase: database, Log: slog.New(slog.DiscardHandler)}}
			now := time.Now().UTC()
			claims := coreauth.AccessTokenClaims{SessionID: uuid.NewString(), SubjectKind: "user", ClientID: coreauth.ClientConsole,
				RegisteredClaims: jwt.RegisteredClaims{Subject: uuid.NewString(), Issuer: issuer.URL, Audience: jwt.ClaimStrings{coreauth.AudienceAPI}, ID: uuid.NewString(), IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(time.Minute))}}
			if tc.kind == "delegated" {
				claims.ClientID = coreauth.ClientSOMWeb
				claims.Actor = &coreauth.Actor{SubjectID: uuid.NewString()}
				claims.Scope = tc.scope
				claims.ProjectIDs = []string{"abcdef0123"}
				claims.DelegationID = uuid.NewString()
				claims.DelegationVersion = 1
			}
			if tc.kind == "agent" {
				claims.SubjectKind = "agent"
				claims.SessionID = ""
				claims.ClientID = coreauth.ClientSOMWorkload
				claims.HostID = uuid.NewString()
				claims.KeyThumbprint = base64.RawURLEncoding.EncodeToString(make([]byte, 32))
				claims.Scope = coreauth.AgentAPIScope
			}
			token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
			token.Header["kid"] = "audit"
			token.Header["typ"] = coreauth.AccessTokenType
			signed, err := token.SignedString(priv)
			if err != nil {
				t.Fatal(err)
			}
			reached := false
			handler := s.authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { reached = true; w.WriteHeader(204) }), "projects.read", tc.allowAgent)
			r := httptest.NewRequest("GET", "/fixture", nil)
			r.SetPathValue("project_id", tc.project)
			if tc.kind != "user" {
				r.SetPathValue("resource_id", "fixture-secret")
			}
			r.Header.Set("Authorization", "Bearer "+signed)
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			if w.Code != tc.status || reached != (tc.status == 204) {
				t.Fatalf("status=%d reached=%v want=%d", w.Code, reached, tc.status)
			}
		})
	}
}
