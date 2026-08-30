package service

import (
	"crypto/ed25519"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
)

func TestCreateInvestigationAgentToken(t *testing.T) {
	publicKey, privateKey, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	authConfig := config.AuthConfig{
		AccessTokenPrivateKey: privateKey,
		AccessTokenIssuer:     "auth.test",
		AccessTokenKid:        "test-key",
	}

	raw, jti, err := CreateInvestigationAgentToken(
		"subject", "session", "user", "client", "abcdef1234",
		"11111111-1111-1111-1111-111111111111", authConfig,
	)
	if err != nil {
		t.Fatal(err)
	}

	claims := &InvestigationAgentClaims{}
	token, err := jwt.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		return publicKey, nil
	},
		jwt.WithValidMethods([]string{jwt.SigningMethodEdDSA.Alg()}),
		jwt.WithIssuer("auth.test"),
		jwt.WithAudience(InvestigationAgentTokenAudience),
		jwt.WithExpirationRequired(),
	)
	if err != nil || !token.Valid {
		t.Fatalf("verify token: %v", err)
	}
	if token.Header["kid"] != "test-key" || token.Header["typ"] != InvestigationAgentTokenType {
		t.Fatalf("unexpected headers: %#v", token.Header)
	}
	if claims.ID != jti || claims.Subject != "subject" || claims.SessionID != "session" || claims.SubjectKind != "user" || claims.ClientID != "client" {
		t.Fatalf("unexpected identity claims: %#v", claims)
	}
	if claims.ProjectID != "abcdef1234" || claims.InvestigationID != "11111111-1111-1111-1111-111111111111" || claims.Scope != InvestigationAgentTokenScope {
		t.Fatalf("unexpected delegated claims: %#v", claims)
	}
	if len(claims.Audience) != 1 || claims.Audience[0] != InvestigationAgentTokenAudience {
		t.Fatalf("unexpected audience: %#v", claims.Audience)
	}
	if got := claims.ExpiresAt.Sub(claims.IssuedAt.Time); got != InvestigationAgentTokenTTL {
		t.Fatalf("unexpected ttl: %s", got)
	}
	if time.Until(claims.ExpiresAt.Time) < InvestigationAgentTokenTTL-time.Minute {
		t.Fatal("token expires too early")
	}
}
