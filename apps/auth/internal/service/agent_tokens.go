package service

import (
	"crypto/ed25519"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
)

const (
	InvestigationAgentTokenAudience = "ir-mcp"
	InvestigationAgentTokenType     = "agent+jwt"
	InvestigationAgentGatewayScope  = "investigation.gateway.read"
	InvestigationAgentTokenScope    = "investigation.graph.read investigation.events.read investigation.agent_results.write " + InvestigationAgentGatewayScope
	InvestigationAgentTokenTTL      = 4 * time.Hour
)

type InvestigationAgentClaims struct {
	SessionID       string `json:"sid"`
	SubjectKind     string `json:"sk"`
	ClientID        string `json:"client_id"`
	ProjectID       string `json:"project_id"`
	InvestigationID string `json:"investigation_id"`
	Scope           string `json:"scope"`
	jwt.RegisteredClaims
}

func VerifyInvestigationAgentToken(raw string, authConfig config.AuthConfig) (InvestigationAgentClaims, error) {
	publicKey, ok := authConfig.AccessTokenPrivateKey.Public().(ed25519.PublicKey)
	if !ok {
		return InvestigationAgentClaims{}, errors.New("invalid access token key")
	}
	claims := InvestigationAgentClaims{}
	token, err := jwt.ParseWithClaims(raw, &claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodEdDSA || token.Header["alg"] != jwt.SigningMethodEdDSA.Alg() {
			return nil, errors.New("unexpected signing method")
		}
		kid, _ := token.Header["kid"].(string)
		typ, _ := token.Header["typ"].(string)
		if kid != authConfig.AccessTokenKid || typ != InvestigationAgentTokenType {
			return nil, errors.New("unexpected token header")
		}
		return publicKey, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodEdDSA.Alg()}),
		jwt.WithIssuer(authConfig.AccessTokenIssuer), jwt.WithAudience(InvestigationAgentTokenAudience),
		jwt.WithExpirationRequired(), jwt.WithIssuedAt())
	if err != nil || token == nil || !token.Valid {
		return InvestigationAgentClaims{}, errors.New("invalid investigation agent token")
	}
	if len(claims.Audience) != 1 || claims.Audience[0] != InvestigationAgentTokenAudience ||
		claims.Subject == "" || claims.SessionID == "" || claims.SubjectKind == "" ||
		claims.ID == "" || claims.IssuedAt == nil || claims.ExpiresAt == nil ||
		claims.ProjectID == "" || claims.InvestigationID == "" || strings.TrimSpace(claims.Scope) == "" {
		return InvestigationAgentClaims{}, errors.New("invalid investigation agent claims")
	}
	return claims, nil
}

func (claims InvestigationAgentClaims) HasScope(required string) bool {
	for _, scope := range strings.Fields(claims.Scope) {
		if scope == required {
			return true
		}
	}
	return false
}

func CreateInvestigationAgentToken(
	subjectID, sessionID, subjectKind, clientID, projectID, investigationID string,
	authConfig config.AuthConfig,
) (string, string, error) {
	now := time.Now().UTC()
	jti := uuid.NewString()
	claims := InvestigationAgentClaims{
		SessionID:       sessionID,
		SubjectKind:     subjectKind,
		ClientID:        clientID,
		ProjectID:       projectID,
		InvestigationID: investigationID,
		Scope:           InvestigationAgentTokenScope,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   subjectID,
			Issuer:    authConfig.AccessTokenIssuer,
			Audience:  jwt.ClaimStrings{InvestigationAgentTokenAudience},
			ExpiresAt: jwt.NewNumericDate(now.Add(InvestigationAgentTokenTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        jti,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = authConfig.AccessTokenKid
	token.Header["typ"] = InvestigationAgentTokenType
	signed, err := token.SignedString(authConfig.AccessTokenPrivateKey)
	if err != nil {
		return "", jti, fmt.Errorf("sign investigation agent token: %w", err)
	}
	return signed, jti, nil
}
