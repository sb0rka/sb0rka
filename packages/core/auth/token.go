package auth

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var ErrUnauthorized = errors.New("unauthorized")
var ErrKeysUnavailable = errors.New("verification keys unavailable")

type Actor struct {
	SubjectID string `json:"sub"`
}

// AccessTokenClaims is the signed identity shared by Auth and Platform API.
type AccessTokenClaims struct {
	SessionID         string   `json:"sid,omitempty"`
	SubjectKind       string   `json:"sk"`
	ClientID          string   `json:"client_id"`
	Actor             *Actor   `json:"act,omitempty"`
	Scope             string   `json:"scope,omitempty"`
	DelegationID      string   `json:"delegation_id,omitempty"`
	DelegationVersion int64    `json:"delegation_version,omitempty"`
	ProjectIDs        []string `json:"project_ids,omitempty"`
	HostID            string   `json:"host_id,omitempty"`
	KeyThumbprint     string   `json:"key_thumbprint,omitempty"`
	jwt.RegisteredClaims
}

type AccessTokenIdentity struct {
	SubjectID         string
	SubjectKind       string
	SessionID         string
	JTI               string
	ClientID          string
	ActorSubjectID    string
	Scope             string
	DelegationID      string
	DelegationVersion int64
	ProjectIDs        []string
	ExpiresAt         time.Time
	HostID            string
	KeyThumbprint     string
}

// KeyProvider resolves verification keys by kid, e.g. a JWKS cache.
type KeyProvider interface {
	Key(ctx context.Context, kid string) (ed25519.PublicKey, error)
}

// VerificationConfig selects the key source: Keys when set, otherwise the local
// PublicKey (current KeyID) and PreviousPublicKeys.
type VerificationConfig struct {
	PublicKey          ed25519.PublicKey
	PreviousPublicKeys map[string]ed25519.PublicKey
	KeyID              string
	Issuer             string
	Audience           string
	Now                func() time.Time
	Keys               KeyProvider
	Policy             *AccessTokenPolicy
}

func ParseBearerToken(authorizationHeader string) (string, error) {
	if len(authorizationHeader) > 16384+32 {
		return "", fmt.Errorf("%w: bearer header too large", ErrUnauthorized)
	}
	parts := strings.Fields(strings.TrimSpace(authorizationHeader))
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || parts[1] == "" {
		return "", fmt.Errorf("%w: malformed bearer header", ErrUnauthorized)
	}
	return parts[1], nil
}

func ParseAndVerifyAccessToken(ctx context.Context, authorizationHeader string, cfg VerificationConfig) (AccessTokenIdentity, error) {
	raw, err := ParseBearerToken(authorizationHeader)
	if err != nil {
		return AccessTokenIdentity{}, err
	}
	return VerifyAccessToken(ctx, raw, cfg)
}

func VerifyAccessToken(ctx context.Context, raw string, cfg VerificationConfig) (AccessTokenIdentity, error) {
	if strings.TrimSpace(raw) == "" || len(raw) > 16384 || cfg.Issuer == "" || cfg.Audience == "" || (cfg.Keys == nil && len(cfg.PublicKey) != ed25519.PublicKeySize) {
		return AccessTokenIdentity{}, fmt.Errorf("%w: invalid token or verification key", ErrUnauthorized)
	}
	if err := validateCompactAccessToken(raw); err != nil {
		return AccessTokenIdentity{}, fmt.Errorf("%w: invalid compact token", ErrUnauthorized)
	}
	policy := DefaultAccessTokenPolicy()
	if cfg.Policy != nil {
		policy = *cfg.Policy
	}
	if err := policy.Validate(); err != nil {
		return AccessTokenIdentity{}, fmt.Errorf("%w: invalid verification policy", ErrUnauthorized)
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
		jwt.WithLeeway(policy.ClockSkew),
		jwt.WithTimeFunc(func() time.Time { return now().UTC() }),
	)
	token, err := parser.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodEdDSA {
			return nil, fmt.Errorf("%w: unexpected signing method", ErrUnauthorized)
		}
		// This token profile implements no critical JOSE extensions.
		if _, present := token.Header["crit"]; present {
			return nil, fmt.Errorf("%w: unsupported critical header", ErrUnauthorized)
		}
		if b64, present := token.Header["b64"]; present && b64 != true {
			return nil, fmt.Errorf("%w: unsupported payload encoding", ErrUnauthorized)
		}
		kid, ok := token.Header["kid"].(string)
		if !ok || kid == "" || len(kid) > 128 {
			return nil, fmt.Errorf("%w: untrusted kid", ErrUnauthorized)
		}
		typ, ok := token.Header["typ"].(string)
		if !ok || typ != AccessTokenType {
			return nil, fmt.Errorf("%w: invalid token typ", ErrUnauthorized)
		}
		if cfg.Keys != nil {
			return cfg.Keys.Key(ctx, kid)
		}
		if kid == cfg.KeyID {
			return cfg.PublicKey, nil
		}
		if key, ok := cfg.PreviousPublicKeys[kid]; ok && len(key) == ed25519.PublicKeySize {
			return key, nil
		}
		return nil, ErrUnauthorized
	})
	if errors.Is(err, ErrKeysUnavailable) {
		return AccessTokenIdentity{}, ErrKeysUnavailable
	}
	if err != nil || token == nil || !token.Valid {
		return AccessTokenIdentity{}, fmt.Errorf("%w: token verification failed", ErrUnauthorized)
	}
	if len(claims.Audience) != 1 || claims.Audience[0] != cfg.Audience {
		return AccessTokenIdentity{}, fmt.Errorf("%w: access token must have exactly one audience", ErrUnauthorized)
	}
	validID := func(raw string) bool { id, err := uuid.Parse(raw); return err == nil && id != uuid.Nil }
	if !validID(claims.Subject) || strings.TrimSpace(claims.ClientID) == "" || claims.SubjectKind == "" || !validID(claims.ID) || claims.IssuedAt == nil || claims.ExpiresAt == nil || !claims.ExpiresAt.After(claims.IssuedAt.Time) || claims.ExpiresAt.Sub(claims.IssuedAt.Time) > policy.MaxTTL {
		return AccessTokenIdentity{}, fmt.Errorf("%w: required claim is missing", ErrUnauthorized)
	}
	if claims.SubjectKind != SubjectUser && claims.SubjectKind != SubjectAgent {
		return AccessTokenIdentity{}, ErrUnauthorized
	}
	if claims.SubjectKind == SubjectUser && (!validID(claims.SessionID) || claims.HostID != "" || claims.KeyThumbprint != "") {
		return AccessTokenIdentity{}, ErrUnauthorized
	}
	thumb, thumbErr := base64.RawURLEncoding.DecodeString(claims.KeyThumbprint)
	if claims.SubjectKind == SubjectAgent {
		scopeOK := claims.Scope == ScopeRelayConnect && cfg.Audience == AudienceRelay ||
			claims.Scope == AgentAPIScope && cfg.Audience == AudienceAPI
		if !validID(claims.HostID) || claims.HostID == claims.Subject || thumbErr != nil || len(thumb) != 32 || base64.RawURLEncoding.EncodeToString(thumb) != claims.KeyThumbprint || !scopeOK || claims.SessionID != "" || claims.Actor != nil {
			return AccessTokenIdentity{}, ErrUnauthorized
		}
	}
	actor := ""
	if claims.Actor != nil {
		actor = claims.Actor.SubjectID
		if !validID(actor) || claims.SubjectKind != SubjectUser || claims.Scope == "" || !validID(claims.DelegationID) || claims.DelegationVersion < 1 || len(claims.ProjectIDs) == 0 {
			return AccessTokenIdentity{}, ErrUnauthorized
		}
	} else if claims.DelegationID != "" || claims.DelegationVersion != 0 || len(claims.ProjectIDs) > 0 {
		return AccessTokenIdentity{}, ErrUnauthorized
	}

	return AccessTokenIdentity{
		SubjectID:      claims.Subject,
		SubjectKind:    claims.SubjectKind,
		SessionID:      claims.SessionID,
		JTI:            claims.ID,
		ClientID:       claims.ClientID,
		ActorSubjectID: actor, Scope: claims.Scope, DelegationID: claims.DelegationID,
		DelegationVersion: claims.DelegationVersion, ProjectIDs: claims.ProjectIDs,
		ExpiresAt: claims.ExpiresAt.Time, HostID: claims.HostID, KeyThumbprint: claims.KeyThumbprint,
	}, nil
}
