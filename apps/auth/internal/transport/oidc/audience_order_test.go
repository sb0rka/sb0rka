package oidc

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
)

func TestAgentAudienceIsValidatedBeforeAttestationConsumption(t *testing.T) {
	var calls atomic.Int32
	attestor := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { calls.Add(1); w.WriteHeader(500) }))
	defer attestor.Close()
	enabled := true
	registry := config.ClientRegistry{Clients: []config.RegisteredClient{{ClientID: "audit-workload", Enabled: &enabled, Type: "confidential", Secrets: [][]byte{bytes.Repeat([]byte("s"), 32)}, Attestation: &config.AttestationConfig{ConsumeURL: attestor.URL, Secret: []byte("fixture")}}}}
	store := &securityAgentStore{client: db.PlatformClient{ClientID: "audit-workload", CanAttest: true}}
	h := NewHandler(store, config.AuthConfig{}, config.OIDCConfig{Registry: registry, ProviderCryptoKey: bytes.Repeat([]byte("k"), 32), CodeHMACKey: bytes.Repeat([]byte("h"), 32)}, slog.New(slog.DiscardHandler))
	for _, audiences := range [][]string{{"unsupported"}, {"sb0rka-api", "sb0rka-relay"}} {
		body := url.Values{"grant_type": {agentGrant}, "attestation": {"fixture"}, "audience": audiences}.Encode()
		r := httptest.NewRequest("POST", "/oauth2/token", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		r.SetBasicAuth("audit-workload", strings.Repeat("s", 32))
		w := httptest.NewRecorder()
		h.PlatformToken(w, r)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("status=%d; invalid audience reached external work", w.Code)
		}
	}
	if calls.Load() != 0 {
		t.Fatal("invalid audience consumed an attestation")
	}
}
