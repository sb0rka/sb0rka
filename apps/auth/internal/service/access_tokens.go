package service

import (
	"crypto/ed25519"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
)

type AccessTokenClaims = coreauth.AccessTokenClaims
type AccessTokenIdentity = coreauth.AccessTokenIdentity

var ErrUnauthorized = coreauth.ErrUnauthorized

// ParseBearerToken extracts a raw JWT from the Authorization header
func ParseBearerToken(authorizationHeader string) (string, error) {
	return coreauth.ParseBearerToken(authorizationHeader)
}

// VerifyAccessToken verifies signature, header fields, and required claims for access JWT
func VerifyAccessToken(rawToken string, authConfig config.AuthConfig) (AccessTokenIdentity, error) {
	publicKey, ok := authConfig.AccessTokenPrivateKey.Public().(ed25519.PublicKey)
	if !ok {
		return AccessTokenIdentity{}, fmt.Errorf("%w: invalid access token key", ErrUnauthorized)
	}
	return coreauth.VerifyAccessToken(rawToken, coreauth.VerificationConfig{
		PublicKey: publicKey,
		KeyID:     authConfig.AccessTokenKid,
		TokenType: authConfig.AccessTokenTyp,
		Issuer:    authConfig.AccessTokenIssuer,
		Audience:  authConfig.AccessTokenAudience,
	})
}

// ParseAndVerifyAccessTokenFromAuthHeader validates Authorization header and JWT
func ParseAndVerifyAccessTokenFromAuthHeader(authorizationHeader string, authConfig config.AuthConfig) (AccessTokenIdentity, error) {
	publicKey, ok := authConfig.AccessTokenPrivateKey.Public().(ed25519.PublicKey)
	if !ok {
		return AccessTokenIdentity{}, fmt.Errorf("%w: invalid access token key", ErrUnauthorized)
	}
	return coreauth.ParseAndVerifyAccessToken(authorizationHeader, coreauth.VerificationConfig{
		PublicKey: publicKey,
		KeyID:     authConfig.AccessTokenKid,
		TokenType: authConfig.AccessTokenTyp,
		Issuer:    authConfig.AccessTokenIssuer,
		Audience:  authConfig.AccessTokenAudience,
	})
}

// CreateAccessToken creates and signs a short-lived JWT access token.
func CreateAccessToken(subjectID, sessionID uuid.UUID, subjectKind string, authConfig config.AuthConfig) (string, error) {
	return createAccessToken(subjectID, sessionID, subjectKind, "", authConfig)
}

func CreateClientAccessToken(subjectID, sessionID uuid.UUID, subjectKind, clientID string, authConfig config.AuthConfig) (string, error) {
	if strings.TrimSpace(clientID) == "" {
		return "", fmt.Errorf("client id is required")
	}
	return createAccessToken(subjectID, sessionID, subjectKind, clientID, authConfig)
}

func createAccessToken(subjectID, sessionID uuid.UUID, subjectKind, clientID string, authConfig config.AuthConfig) (string, error) {
	now := time.Now().UTC()
	claims := AccessTokenClaims{
		SessionID:   sessionID.String(),
		SubjectKind: subjectKind,
		ClientID:    clientID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   subjectID.String(),
			Issuer:    authConfig.AccessTokenIssuer,
			Audience:  jwt.ClaimStrings{authConfig.AccessTokenAudience},
			ExpiresAt: jwt.NewNumericDate(now.Add(authConfig.AccessTokenTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        uuid.NewString(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = authConfig.AccessTokenKid
	token.Header["typ"] = authConfig.AccessTokenTyp

	signedToken, err := token.SignedString(authConfig.AccessTokenPrivateKey)
	if err != nil {
		return "", fmt.Errorf("sign access token error: %w", err)
	}
	return signedToken, nil
}
