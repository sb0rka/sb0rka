package auth

import (
	"crypto/ed25519"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var ErrUnauthorized = errors.New("unauthorized")

// AccessTokenClaims is the signed identity shared by Auth and Platform API.
type AccessTokenClaims struct {
	SessionID   string `json:"sid"`
	SubjectKind string `json:"sk"`
	ClientID    string `json:"client_id,omitempty"`
	jwt.RegisteredClaims
}

type AccessTokenIdentity struct {
	SubjectID   string
	SubjectKind string
	SessionID   string
	JTI         string
	ClientID    string
}

type VerificationConfig struct {
	PublicKey ed25519.PublicKey
	KeyID     string
	TokenType string
	Issuer    string
	Audience  string
	Now       func() time.Time
}

func ParseBearerToken(authorizationHeader string) (string, error) {
	parts := strings.Fields(strings.TrimSpace(authorizationHeader))
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		return "", fmt.Errorf("%w: malformed bearer header", ErrUnauthorized)
	}
	return parts[1], nil
}

func ParseAndVerifyAccessToken(authorizationHeader string, cfg VerificationConfig) (AccessTokenIdentity, error) {
	raw, err := ParseBearerToken(authorizationHeader)
	if err != nil {
		return AccessTokenIdentity{}, err
	}
	return VerifyAccessToken(raw, cfg)
}

func VerifyAccessToken(raw string, cfg VerificationConfig) (AccessTokenIdentity, error) {
	if strings.TrimSpace(raw) == "" || len(cfg.PublicKey) != ed25519.PublicKeySize {
		return AccessTokenIdentity{}, fmt.Errorf("%w: invalid token or verification key", ErrUnauthorized)
	}
	now := cfg.Now
	if now == nil {
		now = time.Now
	}

	claims := &AccessTokenClaims{}
	parser := jwt.NewParser(
		jwt.WithValidMethods([]string{jwt.SigningMethodEdDSA.Alg()}),
		jwt.WithIssuer(cfg.Issuer),
		jwt.WithAudience(cfg.Audience),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithTimeFunc(func() time.Time { return now().UTC() }),
	)
	token, err := parser.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodEdDSA {
			return nil, fmt.Errorf("%w: unexpected signing method", ErrUnauthorized)
		}
		kid, ok := token.Header["kid"].(string)
		if !ok || kid == "" || kid != cfg.KeyID {
			return nil, fmt.Errorf("%w: untrusted kid", ErrUnauthorized)
		}
		typ, ok := token.Header["typ"].(string)
		if !ok || typ != cfg.TokenType {
			return nil, fmt.Errorf("%w: invalid token typ", ErrUnauthorized)
		}
		return cfg.PublicKey, nil
	})
	if err != nil || token == nil || !token.Valid {
		return AccessTokenIdentity{}, fmt.Errorf("%w: token verification failed", ErrUnauthorized)
	}
	if len(claims.Audience) != 1 || claims.Audience[0] != cfg.Audience {
		return AccessTokenIdentity{}, fmt.Errorf("%w: access token must have exactly one audience", ErrUnauthorized)
	}
	if claims.Subject == "" || claims.SessionID == "" || claims.SubjectKind == "" || claims.ID == "" {
		return AccessTokenIdentity{}, fmt.Errorf("%w: required claim is missing", ErrUnauthorized)
	}

	return AccessTokenIdentity{
		SubjectID:   claims.Subject,
		SubjectKind: claims.SubjectKind,
		SessionID:   claims.SessionID,
		JTI:         claims.ID,
		ClientID:    claims.ClientID,
	}, nil
}
