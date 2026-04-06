package service

import (
	"crypto/ed25519"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/sb0rka/sb0rka/apps/api/internal/config"

	"github.com/golang-jwt/jwt/v5"
)

var (
	// ErrUnauthorized marks token/header validation failures that should map to HTTP 401
	ErrUnauthorized = errors.New("unauthorized")
)

// AccessTokenIdentity is a normalized identity extracted from a verified access token.
type AccessTokenIdentity struct {
	UserID    string
	SessionID string
	JTI       string
}

// AccessTokenClaims contains custom access token claims.
type AccessTokenClaims struct {
	SessionID string `json:"sid"`
	jwt.RegisteredClaims
}

// ParseBearerToken extracts a raw JWT from the Authorization header.
func ParseBearerToken(authorizationHeader string) (string, error) {
	value := strings.TrimSpace(authorizationHeader)
	if value == "" {
		return "", fmt.Errorf("%w: empty authorization header", ErrUnauthorized)
	}

	parts := strings.Fields(value)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		return "", fmt.Errorf("%w: malformed bearer header", ErrUnauthorized)
	}

	return parts[1], nil
}

// ParseAndVerifyAccessTokenFromAuthHeader validates Authorization header and JWT
func ParseAndVerifyAccessTokenFromAuthHeader(authorizationHeader string, authConfig config.AuthConfig) (AccessTokenIdentity, error) {
	rawToken, err := ParseBearerToken(authorizationHeader)
	if err != nil {
		return AccessTokenIdentity{}, err
	}
	return VerifyAccessToken(rawToken, authConfig)
}

// VerifyAccessToken verifies signature, header fields, and required claims for access JWT.
func VerifyAccessToken(rawToken string, authConfig config.AuthConfig) (AccessTokenIdentity, error) {
	if strings.TrimSpace(rawToken) == "" {
		return AccessTokenIdentity{}, fmt.Errorf("%w: empty access token", ErrUnauthorized)
	}

	publicKey, ok := authConfig.AccessTokenPrivateKey.Public().(ed25519.PublicKey)
	if !ok {
		return AccessTokenIdentity{}, fmt.Errorf("%w: invalid access token key", ErrUnauthorized)
	}
	trustedKeysByKid := map[string]ed25519.PublicKey{
		authConfig.AccessTokenKid: publicKey,
	}

	claims := &AccessTokenClaims{}
	token, err := jwt.ParseWithClaims(rawToken, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodEdDSA {
			return nil, fmt.Errorf("%w: unexpected signing method", ErrUnauthorized)
		}

		kidRaw, ok := token.Header["kid"]
		if !ok {
			return nil, fmt.Errorf("%w: missing kid header", ErrUnauthorized)
		}
		kid, ok := kidRaw.(string)
		if !ok || kid == "" {
			return nil, fmt.Errorf("%w: invalid kid header", ErrUnauthorized)
		}

		key, ok := trustedKeysByKid[kid]
		if !ok {
			return nil, fmt.Errorf("%w: untrusted kid", ErrUnauthorized)
		}
		return key, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodEdDSA.Alg()}))
	if err != nil {
		return AccessTokenIdentity{}, fmt.Errorf("%w: token parse/verify failed: %v", ErrUnauthorized, err)
	}
	if !token.Valid {
		return AccessTokenIdentity{}, fmt.Errorf("%w: token is not valid", ErrUnauthorized)
	}

	typRaw, ok := token.Header["typ"]
	if !ok {
		return AccessTokenIdentity{}, fmt.Errorf("%w: missing typ header", ErrUnauthorized)
	}
	typ, ok := typRaw.(string)
	if !ok || typ != authConfig.AccessTokenTyp {
		return AccessTokenIdentity{}, fmt.Errorf("%w: invalid token typ", ErrUnauthorized)
	}

	if claims.Issuer != authConfig.AccessTokenIssuer {
		return AccessTokenIdentity{}, fmt.Errorf("%w: invalid token issuer", ErrUnauthorized)
	}
	hasExpectedAudience := false
	for _, aud := range claims.Audience {
		if aud == authConfig.AccessTokenAudience {
			hasExpectedAudience = true
			break
		}
	}
	if !hasExpectedAudience {
		return AccessTokenIdentity{}, fmt.Errorf("%w: invalid token audience", ErrUnauthorized)
	}
	if claims.ExpiresAt == nil || !claims.ExpiresAt.After(time.Now().UTC()) {
		return AccessTokenIdentity{}, fmt.Errorf("%w: token expired", ErrUnauthorized)
	}
	if claims.Subject == "" {
		return AccessTokenIdentity{}, fmt.Errorf("%w: missing sub claim", ErrUnauthorized)
	}
	if claims.SessionID == "" {
		return AccessTokenIdentity{}, fmt.Errorf("%w: missing sid claim", ErrUnauthorized)
	}
	if claims.ID == "" {
		return AccessTokenIdentity{}, fmt.Errorf("%w: missing jti claim", ErrUnauthorized)
	}

	return AccessTokenIdentity{
		UserID:    claims.Subject,
		SessionID: claims.SessionID,
		JTI:       claims.ID,
	}, nil
}
