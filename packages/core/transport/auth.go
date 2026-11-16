package transport

import (
	"context"
	"crypto/ed25519"
	"net/http"

	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"
)

// AuthConfig configures access-token verification.
type AuthConfig struct {
	PublicKey ed25519.PublicKey
	Issuer    string
	Audience  string
	Kid       string
	Policy    *coreauth.AccessTokenPolicy
}

// ParseAndVerifyAccessToken returns a verified identity.
func ParseAndVerifyAccessToken(ctx context.Context, raw string, cfg AuthConfig) (authctx.Identity, bool) {
	identity, err := coreauth.VerifyAccessToken(ctx, raw, coreauth.VerificationConfig{
		PublicKey: cfg.PublicKey,
		KeyID:     cfg.Kid,
		Issuer:    cfg.Issuer,
		Audience:  cfg.Audience,
		Policy:    cfg.Policy,
	})
	if err != nil {
		return authctx.Identity{}, false
	}

	return authctx.Identity{
		SubjectID:         identity.SubjectID,
		SubjectKind:       identity.SubjectKind,
		SessionID:         identity.SessionID,
		JTI:               identity.JTI,
		ClientID:          identity.ClientID,
		ActorSubjectID:    identity.ActorSubjectID,
		Scope:             identity.Scope,
		DelegationID:      identity.DelegationID,
		DelegationVersion: identity.DelegationVersion,
		ProjectIDs:        identity.ProjectIDs,
	}, true
}

// BearerToken parses an Authorization header.
func BearerToken(header string) (string, bool) {
	token, err := coreauth.ParseBearerToken(header)
	return token, err == nil
}

// Auth verifies a token and stores its identity in the request context.
// onUnauthorized writes the service-specific error response.
func Auth(cfg AuthConfig, onUnauthorized func(http.ResponseWriter, *http.Request)) Middleware {
	deny := onUnauthorized
	if deny == nil {
		deny = func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw, ok := BearerToken(r.Header.Get("Authorization"))
			if !ok {
				deny(w, r)
				return
			}

			identity, ok := ParseAndVerifyAccessToken(r.Context(), raw, cfg)
			if !ok {
				deny(w, r)
				return
			}

			next.ServeHTTP(w, r.WithContext(authctx.WithIdentity(r.Context(), identity)))
		})
	}
}
