package auth

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/golang-jwt/jwt/v5"
)

type forbiddenKeyResolver struct{ t *testing.T }

func (r forbiddenKeyResolver) Key(context.Context, string) (ed25519.PublicKey, error) {
	r.t.Fatal("unsupported extension reached resolver")
	return nil, nil
}
func TestSecurityCriticalHeadersBeforeKeyLookup(t *testing.T) {
	pub, priv := newTestKey(t)
	for _, header := range []map[string]any{{"crit": nil}, {"crit": []string{}}, {"crit": "extension"}, {"crit": []string{"extension"}, "extension": true}, {"b64": false}, {"b64": "true"}} {
		raw := signTestToken(t, priv, tokenOptions{})
		parts := strings.Split(raw, ".")
		var h map[string]any
		b, _ := base64.RawURLEncoding.DecodeString(parts[0])
		_ = json.Unmarshal(b, &h)
		for k, v := range header {
			h[k] = v
		}
		b, _ = json.Marshal(h)
		input := base64.RawURLEncoding.EncodeToString(b) + "." + parts[1]
		sig, err := jwt.SigningMethodEdDSA.Sign(input, priv)
		if err != nil {
			t.Fatal(err)
		}
		cfg := testVerificationConfig(pub)
		// Unsupported headers must fail before any key lookup.
		cfg.Keys = forbiddenKeyResolver{t: t}
		if _, err := VerifyAccessToken(t.Context(), input+"."+base64.RawURLEncoding.EncodeToString(sig), cfg); !errors.Is(err, ErrUnauthorized) {
			t.Fatalf("header %v: %v", header, err)
		}
	}
}
