package transport

import (
	"bytes"
	"crypto/ed25519"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"
	"github.com/sb0rka/sb0rka/apps/auth/internal/service"
)

func TestExchangeInvestigationAgentToken(t *testing.T) {
	_, privateKey, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	subjectID, sessionID := uuid.New(), uuid.New()
	cfg := config.ServerConfig{
		InvestigationAgentExchange: &config.InvestigationAgentExchangeConfig{
			ClientID: "ir-api", ClientSecret: []byte("01234567890123456789012345678901"),
		},
		AuthConfig: config.AuthConfig{
			AccessTokenPrivateKey: privateKey, AccessTokenTTL: 5 * time.Minute,
			AccessTokenIssuer: "auth.test", AccessTokenAudience: "api.test",
			AccessTokenKid: "test-key", AccessTokenTyp: "access+jwt",
		},
	}
	fake := &agentTokenDatabase{session: model.AuthSession{
		ID: sessionID, SubjectID: subjectID, SubjectKind: model.SubjectKindUser,
		ExpiresAt: time.Now().UTC().Add(time.Hour),
	}}
	server := NewServer(Dependencies{Database: fake, Cfg: cfg, Log: discardLogger()})
	agentToken, _, err := service.CreateInvestigationAgentToken(
		subjectID.String(), sessionID.String(), model.SubjectKindUser, "som", "abcdef1234",
		"11111111-1111-1111-1111-111111111111", cfg.AuthConfig)
	if err != nil {
		t.Fatal(err)
	}

	call := func(secret, token string) *httptest.ResponseRecorder {
		body, _ := json.Marshal(investigationAgentExchangeRequest{SubjectToken: token})
		request := httptest.NewRequest(http.MethodPost, "/auth/agent-tokens/exchange", bytes.NewReader(body))
		request.SetBasicAuth("ir-api", secret)
		recorder := httptest.NewRecorder()
		server.exchangeInvestigationAgentToken(recorder, request)
		return recorder
	}
	response := call("01234567890123456789012345678901", agentToken)
	if response.Code != http.StatusOK || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("exchange status=%d body=%s", response.Code, response.Body.String())
	}
	var result investigationAgentExchangeResponse
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil || result.AccessToken == "" || result.ExpiresIn != 300 {
		t.Fatalf("unexpected exchange response: %#v err=%v", result, err)
	}
	identity, err := service.VerifyAccessToken(result.AccessToken, cfg.AuthConfig)
	if err != nil || identity.SubjectID != subjectID.String() || identity.ClientID != "ir-api" {
		t.Fatalf("invalid exchanged token identity=%#v err=%v", identity, err)
	}
	if response := call("wrong-secret", agentToken); response.Code != http.StatusUnauthorized {
		t.Fatalf("wrong secret status=%d", response.Code)
	}

	claims, err := service.VerifyInvestigationAgentToken(agentToken, cfg.AuthConfig)
	if err != nil {
		t.Fatal(err)
	}
	claims.Scope = "investigation.graph.read"
	jwtToken := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	jwtToken.Header["kid"] = cfg.AuthConfig.AccessTokenKid
	jwtToken.Header["typ"] = service.InvestigationAgentTokenType
	withoutGatewayScope, err := jwtToken.SignedString(privateKey)
	if err != nil {
		t.Fatal(err)
	}
	if response := call("01234567890123456789012345678901", withoutGatewayScope); response.Code != http.StatusUnauthorized {
		t.Fatalf("missing scope status=%d", response.Code)
	}

	now := time.Now().UTC()
	fake.session.RevokedAt = &now
	if response := call("01234567890123456789012345678901", agentToken); response.Code != http.StatusUnauthorized {
		t.Fatalf("revoked session status=%d", response.Code)
	}
}
