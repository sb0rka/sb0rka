package service

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
)

const (
	InvestigationAgentTokenAudience = "ir-mcp"
	InvestigationAgentTokenType     = "agent+jwt"
	InvestigationAgentTokenScope    = "investigation.graph.read investigation.events.read investigation.agent_results.write"
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
