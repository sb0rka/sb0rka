package transport

import (
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
	Typ       string
}

// ParseAndVerifyAccessToken returns a verified identity.
func ParseAndVerifyAccessToken(raw string, cfg AuthConfig) (authctx.Identity, bool) {
	identity, err := coreauth.VerifyAccessToken(raw, coreauth.VerificationConfig{
		PublicKey: cfg.PublicKey,
		KeyID:     cfg.Kid,
		TokenType: cfg.Typ,
		Issuer:    cfg.Issuer,
		Audience:  cfg.Audience,
	})
	if err != nil {
		return authctx.Identity{}, false
	}

	return authctx.Identity{
		SubjectID:   identity.SubjectID,
		SubjectKind: identity.SubjectKind,
		SessionID:   identity.SessionID,
		JTI:         identity.JTI,
		ClientID:    identity.ClientID,
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

			identity, ok := ParseAndVerifyAccessToken(raw, cfg)
			if !ok {
				deny(w, r)
				return
			}

			next.ServeHTTP(w, r.WithContext(authctx.WithIdentity(r.Context(), identity)))
		})
	}
}
