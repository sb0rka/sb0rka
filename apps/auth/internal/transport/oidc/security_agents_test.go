package oidc

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
	"github.com/sb0rka/sb0rka/packages/contract"
	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
)

type securityAgentStore struct {
	db.Database
	client   db.PlatformClient
	identity db.AgentIdentity
}

func (s *securityAgentStore) PlatformClient(_ context.Context, id string) (db.PlatformClient, error) {
	if id != s.client.ClientID {
		return db.PlatformClient{}, coreauth.ErrUnauthorized
	}
	return s.client, nil
}
func (s *securityAgentStore) AgentIdentity(_ context.Context, client string, id uuid.UUID) (db.AgentIdentity, error) {
	if id != s.identity.SubjectID || client != s.client.ClientID {
		return db.AgentIdentity{}, db.ErrOIDCInvalidGrant
	}
	return s.identity, nil
}
func (s *securityAgentStore) EnrollAgent(_ context.Context, client string, host uuid.UUID, pub []byte, thumb string, attestation uuid.UUID) (db.AgentIdentity, error) {
	s.identity.HostID = host
	s.identity.PublicKey = pub
	s.identity.Thumbprint = thumb
	return s.identity, nil
}
func (s *securityAgentStore) RevokeAgent(_ context.Context, client string, id, attestation uuid.UUID) error {
	s.identity.Revoked = true
	return nil
}
func (s *securityAgentStore) AuditPlatform(context.Context, string, string, *uuid.UUID, *uuid.UUID, *uuid.UUID, *uuid.UUID, string, string) error {
	return nil
}

func TestSecurityAgentAttestationBoundary(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(pub)
	subject, host := uuid.New(), uuid.New()
	for _, tc := range []struct {
		name   string
		mutate func(*contract.AgentAttestation, *securityAgentStore)
		status int
	}{
		{"valid_issue", nil, 200},
		{"enroll", func(a *contract.AgentAttestation, s *securityAgentStore) { a.Purpose = "enroll"; a.SubjectID = nil }, 200},
		{"revoke", func(a *contract.AgentAttestation, s *securityAgentStore) { a.Purpose = "revoke" }, 204},
		{"expired", func(a *contract.AgentAttestation, s *securityAgentStore) { a.ExpiresAt = time.Now().Unix() - 1 }, 400},
		{"future_verified", func(a *contract.AgentAttestation, s *securityAgentStore) {
			a.VerifiedAt = time.Now().Unix() + 60
			a.ExpiresAt = a.VerifiedAt + 30
		}, 400},
		{"stale_verified", func(a *contract.AgentAttestation, s *securityAgentStore) { a.VerifiedAt = time.Now().Unix() - 90 }, 400},
		{"excess_lifetime", func(a *contract.AgentAttestation, s *securityAgentStore) { a.ExpiresAt = a.VerifiedAt + 120 }, 400},
		{"wrong_host", func(a *contract.AgentAttestation, s *securityAgentStore) { a.HostID = uuid.New() }, 400},
		{"wrong_subject", func(a *contract.AgentAttestation, s *securityAgentStore) { id := uuid.New(); a.SubjectID = &id }, 400},
		{"missing_subject", func(a *contract.AgentAttestation, s *securityAgentStore) { a.SubjectID = nil }, 400},
		{"wrong_thumb", func(a *contract.AgentAttestation, s *securityAgentStore) {
			a.KeyThumbprint = base64.RawURLEncoding.EncodeToString(make([]byte, 32))
		}, 400},
		{"wrong_key", func(a *contract.AgentAttestation, s *securityAgentStore) {
			p, _, err := ed25519.GenerateKey(rand.Reader)
			if err != nil {
				t.Fatal(err)
			}
			hash := sha256.Sum256(p)
			a.PublicKey = base64.RawURLEncoding.EncodeToString(p)
			a.KeyThumbprint = base64.RawURLEncoding.EncodeToString(hash[:])
		}, 400},
		{"revoked", func(a *contract.AgentAttestation, s *securityAgentStore) { s.identity.Revoked = true }, 400},
		{"unknown_purpose", func(a *contract.AgentAttestation, s *securityAgentStore) { a.Purpose = "admin" }, 400},
		{"nil_attestation", func(a *contract.AgentAttestation, s *securityAgentStore) { a.ID = uuid.Nil }, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			now := time.Now().Unix()
			attestation := contract.AgentAttestation{ID: uuid.New(), Purpose: "issue", SubjectID: &subject, HostID: host, PublicKey: base64.RawURLEncoding.EncodeToString(pub), KeyThumbprint: base64.RawURLEncoding.EncodeToString(sum[:]), VerifiedAt: now, ExpiresAt: now + 30}
			store := &securityAgentStore{client: db.PlatformClient{ClientID: "audit-workload", CanAttest: true}, identity: db.AgentIdentity{SubjectID: subject, HostID: host, PublicKey: pub, Thumbprint: attestation.KeyThumbprint}}
			if tc.mutate != nil {
				tc.mutate(&attestation, store)
			}
			var calls atomic.Int32
			attestor := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if r.Header.Get("Authorization") != "Bearer attestor-test-secret" {
					w.WriteHeader(401)
					return
				}
				_ = json.NewEncoder(w).Encode(attestation)
			}))
			defer attestor.Close()
			enabled := true
			registry := config.ClientRegistry{Clients: []config.RegisteredClient{{ClientID: "audit-workload", Enabled: &enabled, Type: "confidential", AuthMethod: "client_secret_basic", Secrets: [][]byte{bytes.Repeat([]byte("s"), 32)}, Attestation: &config.AttestationConfig{ConsumeURL: attestor.URL, Secret: []byte("attestor-test-secret")}}}}
			cfg := config.OIDCConfig{Registry: registry, ProviderCryptoKey: bytes.Repeat([]byte("k"), 32), CodeHMACKey: bytes.Repeat([]byte("h"), 32)}
			authCfg := config.AuthConfig{AccessTokenPrivateKey: priv, AccessTokenIssuer: "https://audit.example", AccessTokenKid: "audit", AccessTokenTTL: time.Minute}
			h := NewHandler(store, authCfg, cfg, slog.New(slog.DiscardHandler))
			body := url.Values{"grant_type": {agentGrant}, "attestation": {"opaque-fixture"}, "audience": {coreauth.AudienceAPI}}.Encode()
			r := httptest.NewRequest("POST", "/oauth2/token", strings.NewReader(body))
			r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			r.SetBasicAuth("audit-workload", strings.Repeat("s", 32))
			w := httptest.NewRecorder()
			h.PlatformToken(w, r)
			if w.Code != tc.status {
				t.Fatalf("status=%d want=%d", w.Code, tc.status)
			}
			if calls.Load() != 1 {
				t.Fatal("attestor not called exactly once")
			}
			if tc.status == 200 {
				var response contract.AgentTokenResponse
				if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
					t.Fatal(err)
				}
				id, err := coreauth.VerifyAccessToken(t.Context(), response.AccessToken, coreauth.VerificationConfig{PublicKey: pub, KeyID: "audit", Issuer: authCfg.AccessTokenIssuer, Audience: coreauth.AudienceAPI})
				if err != nil || id.SubjectKind != "agent" || id.HostID != host.String() || id.SessionID != "" || id.ActorSubjectID != "" {
					t.Fatalf("agent token profile: %v", err)
				}
			}
		})
	}
}
