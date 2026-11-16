package service

import (
	"context"
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

// verificationConfig verifies against the local signing key and previously published keys.
func verificationConfig(authConfig config.AuthConfig, audience string) (coreauth.VerificationConfig, error) {
	publicKey, ok := authConfig.AccessTokenPrivateKey.Public().(ed25519.PublicKey)
	if !ok {
		return coreauth.VerificationConfig{}, fmt.Errorf("%w: invalid access token key", ErrUnauthorized)
	}
	return coreauth.VerificationConfig{
		PublicKey:          publicKey,
		PreviousPublicKeys: authConfig.PreviousAccessPublicKeys,
		KeyID:              authConfig.AccessTokenKid,
		Issuer:             authConfig.AccessTokenIssuer,
		Audience:           audience,
		Policy:             authConfig.AccessTokenPolicy,
	}, nil
}

// VerifyAccessToken verifies signature, header fields, and required claims for an access JWT
// issued for the API audience.
func VerifyAccessToken(ctx context.Context, rawToken string, authConfig config.AuthConfig) (AccessTokenIdentity, error) {
	return VerifyAccessTokenForAudience(ctx, rawToken, authConfig.AccessTokenAudience, authConfig)
}

// VerifyAccessTokenForAudience verifies an access JWT that must be addressed to audience.
func VerifyAccessTokenForAudience(ctx context.Context, rawToken, audience string, authConfig config.AuthConfig) (AccessTokenIdentity, error) {
	cfg, err := verificationConfig(authConfig, audience)
	if err != nil {
		return AccessTokenIdentity{}, err
	}
	return coreauth.VerifyAccessToken(ctx, rawToken, cfg)
}

// ParseAndVerifyAccessTokenFromAuthHeader validates Authorization header and JWT
func ParseAndVerifyAccessTokenFromAuthHeader(ctx context.Context, authorizationHeader string, authConfig config.AuthConfig) (AccessTokenIdentity, error) {
	cfg, err := verificationConfig(authConfig, authConfig.AccessTokenAudience)
	if err != nil {
		return AccessTokenIdentity{}, err
	}
	return coreauth.ParseAndVerifyAccessToken(ctx, authorizationHeader, cfg)
}

// CreateAccessToken creates and signs a short-lived console JWT access token for the API audience.
func CreateAccessToken(subjectID, sessionID uuid.UUID, subjectKind string, authConfig config.AuthConfig) (string, error) {
	return createAccessToken(subjectID, sessionID, subjectKind, coreauth.ClientConsole, authConfig.AccessTokenAudience, authConfig)
}

// CreateClientAccessToken signs a short-lived JWT access token for an OAuth client and an explicit audience.
func CreateClientAccessToken(subjectID, sessionID uuid.UUID, subjectKind, clientID, audience string, authConfig config.AuthConfig) (string, error) {
	if strings.TrimSpace(clientID) == "" {
		return "", fmt.Errorf("client id is required")
	}
	if strings.TrimSpace(audience) == "" {
		return "", fmt.Errorf("audience is required")
	}
	return createAccessToken(subjectID, sessionID, subjectKind, clientID, audience, authConfig)
}

func createAccessToken(subjectID, sessionID uuid.UUID, subjectKind, clientID, audience string, authConfig config.AuthConfig) (string, error) {
	now := time.Now().UTC()
	claims := AccessTokenClaims{
		SessionID:   sessionID.String(),
		SubjectKind: subjectKind,
		ClientID:    clientID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   subjectID.String(),
			Issuer:    authConfig.AccessTokenIssuer,
			Audience:  jwt.ClaimStrings{audience},
			ExpiresAt: jwt.NewNumericDate(now.Add(authConfig.AccessTokenTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        uuid.NewString(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = authConfig.AccessTokenKid
	token.Header["typ"] = coreauth.AccessTokenType

	signedToken, err := token.SignedString(authConfig.AccessTokenPrivateKey)
	if err != nil {
		return "", fmt.Errorf("sign access token error: %w", err)
	}
	return signedToken, nil
}
