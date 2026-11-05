package auth

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Each malformed-claim case retains a trusted signature, so it exercises the
// claim validator rather than merely failing cryptographic verification.
func TestSecuritySignedClaims(t *testing.T) {
	pub, priv := newTestKey(t)
	cases := map[string]func(*AccessTokenClaims){
		"missing_sub":         func(c *AccessTokenClaims) { c.Subject = "" },
		"nil_sub":             func(c *AccessTokenClaims) { c.Subject = "00000000-0000-0000-0000-000000000000" },
		"malformed_sid":       func(c *AccessTokenClaims) { c.SessionID = "../session" },
		"missing_jti":         func(c *AccessTokenClaims) { c.ID = "" },
		"missing_iat":         func(c *AccessTokenClaims) { c.IssuedAt = nil },
		"missing_exp":         func(c *AccessTokenClaims) { c.ExpiresAt = nil },
		"missing_client":      func(c *AccessTokenClaims) { c.ClientID = " " },
		"missing_kind":        func(c *AccessTokenClaims) { c.SubjectKind = "" },
		"missing_issuer":      func(c *AccessTokenClaims) { c.Issuer = "" },
		"no_audience":         func(c *AccessTokenClaims) { c.Audience = nil },
		"duplicate_audience":  func(c *AccessTokenClaims) { c.Audience = jwt.ClaimStrings{AudienceAPI, AudienceAPI} },
		"reverse_lifetime":    func(c *AccessTokenClaims) { c.ExpiresAt = c.IssuedAt },
		"future_nbf":          func(c *AccessTokenClaims) { c.NotBefore = jwt.NewNumericDate(testNow.Add(ClockSkew + time.Second)) },
		"user_host":           func(c *AccessTokenClaims) { c.HostID = c.Subject },
		"user_thumbprint":     func(c *AccessTokenClaims) { c.KeyThumbprint = strings.Repeat("A", 43) },
		"orphan_projects":     func(c *AccessTokenClaims) { c.ProjectIDs = []string{"foreign-project"} },
		"orphan_version":      func(c *AccessTokenClaims) { c.DelegationVersion = 1 },
		"actor_without_grant": func(c *AccessTokenClaims) { c.Actor = &Actor{SubjectID: c.Subject} },
	}
	if _, err := VerifyAccessToken(context.Background(), signTestToken(t, priv, tokenOptions{}), testVerificationConfig(pub)); err != nil {
		t.Fatal(err)
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			raw := signTestToken(t, priv, tokenOptions{mutate: mutate})
			if _, err := VerifyAccessToken(context.Background(), raw, testVerificationConfig(pub)); !errors.Is(err, ErrUnauthorized) {
				t.Fatalf("accepted invalid signed claims: %v", err)
			}
		})
	}
}

func TestSecurityJOSETrust(t *testing.T) {
	pub, priv := newTestKey(t)
	var hits atomic.Int32
	trap := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits.Add(1); w.WriteHeader(500) }))
	defer trap.Close()
	for name, header := range map[string]map[string]any{
		"jku": {"jku": trap.URL + "/jwks"},
		"x5u": {"x5u": trap.URL + "/cert"},
		"jwk": {"jwk": map[string]string{"kty": "OKP", "crv": "Ed25519", "x": base64.RawURLEncoding.EncodeToString(pub)}},
	} {
		t.Run(name, func(t *testing.T) {
			raw := signTestToken(t, priv, tokenOptions{kid: "untrusted"})
			parts := strings.Split(raw, ".")
			h := map[string]any{"alg": "EdDSA", "typ": AccessTokenType, "kid": "untrusted"}
			for k, v := range header {
				h[k] = v
			}
			b, _ := json.Marshal(h)
			parts[0] = base64.RawURLEncoding.EncodeToString(b)
			// Re-sign with a key that is deliberately absent from the key registry.
			input := parts[0] + "." + parts[1]
			sig, err := jwt.SigningMethodEdDSA.Sign(input, priv)
			if err != nil {
				t.Fatal(err)
			}
			raw = input + "." + base64.RawURLEncoding.EncodeToString(sig)
			if _, err := VerifyAccessToken(context.Background(), raw, testVerificationConfig(pub)); !errors.Is(err, ErrUnauthorized) {
				t.Fatalf("header supplied trust: %v", err)
			}
		})
	}
	if hits.Load() != 0 {
		t.Fatal("JOSE header caused a network request")
	}
	for _, method := range []jwt.SigningMethod{jwt.SigningMethodNone, jwt.SigningMethodHS256} {
		t.Run(method.Alg(), func(t *testing.T) {
			key := any([]byte(pub))
			if method == jwt.SigningMethodNone {
				key = jwt.UnsafeAllowNoneSignatureType
			}
			raw := signTestToken(t, priv, tokenOptions{method: method, key: key})
			if _, err := VerifyAccessToken(context.Background(), raw, testVerificationConfig(pub)); !errors.Is(err, ErrUnauthorized) {
				t.Fatalf("algorithm confusion: %v", err)
			}
		})
	}
}

func TestSecurityUnknownCriticalHeader(t *testing.T) {
	pub, priv := newTestKey(t)
	raw := signTestToken(t, priv, tokenOptions{})
	parts := strings.Split(raw, ".")
	header := map[string]any{"alg": "EdDSA", "typ": AccessTokenType, "kid": testKID, "crit": []string{"audit_extension"}, "audit_extension": true}
	b, _ := json.Marshal(header)
	parts[0] = base64.RawURLEncoding.EncodeToString(b)
	input := parts[0] + "." + parts[1]
	sig, err := jwt.SigningMethodEdDSA.Sign(input, priv)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = VerifyAccessToken(context.Background(), input+"."+base64.RawURLEncoding.EncodeToString(sig), testVerificationConfig(pub)); err == nil {
		t.Fatal("SEC-JOSE-001: unsupported critical JWS extension accepted (RFC 7515 section 4.1.11)")
	}
}

func TestSecurityTemporalBoundaries(t *testing.T) {
	pub, priv := newTestKey(t)
	for _, tc := range []struct {
		name    string
		issued  time.Time
		ttl     time.Duration
		allowed bool
	}{
		{"max_ttl", testNow, MaxAccessTokenTTL, true},
		{"above_max", testNow, MaxAccessTokenTTL + time.Second, false},
		{"future_at_skew", testNow.Add(ClockSkew), time.Minute, true},
		{"future_above_skew", testNow.Add(ClockSkew + time.Second), time.Minute, false},
		{"expiry_inside_skew", testNow.Add(-time.Minute - ClockSkew + time.Second), time.Minute, true},
		{"expiry_at_skew", testNow.Add(-time.Minute - ClockSkew), time.Minute, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := VerifyAccessToken(context.Background(), signTestToken(t, priv, tokenOptions{issuedAt: tc.issued, ttl: tc.ttl}), testVerificationConfig(pub))
			if (err == nil) != tc.allowed {
				t.Fatalf("allowed=%v err=%v", tc.allowed, err)
			}
		})
	}
}

func TestSecurityJWKSProfiles(t *testing.T) {
	x := base64.RawURLEncoding.EncodeToString(make([]byte, 32))
	key := map[string]any{"kty": "OKP", "crv": "Ed25519", "alg": "EdDSA", "use": "sig", "kid": "k", "x": x}
	for _, tc := range []struct {
		name   string
		mutate func(map[string]any)
	}{
		{"bad_curve", func(k map[string]any) { k["crv"] = "X25519" }},
		{"encryption_key", func(k map[string]any) { k["use"] = "enc" }},
		{"wrong_algorithm", func(k map[string]any) { k["alg"] = "HS256" }},
		{"padded_encoding", func(k map[string]any) { k["x"] = x + "=" }},
		{"short_key", func(k map[string]any) { k["x"] = "AA" }},
		{"missing_kid", func(k map[string]any) { delete(k, "kid") }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			copy := map[string]any{}
			for k, v := range key {
				copy[k] = v
			}
			tc.mutate(copy)
			raw, _ := json.Marshal(map[string]any{"keys": []any{copy}})
			if _, err := AccessPublicKeys(raw); err == nil {
				t.Fatal("invalid key accepted")
			}
		})
	}
	raw, _ := json.Marshal(map[string]any{"keys": []any{key, key}})
	if _, err := AccessPublicKeys(raw); err == nil {
		t.Fatal("duplicate kid accepted")
	}
	raw, _ = json.Marshal(map[string]any{"keys": []any{key, map[string]any{"kty": "RSA", "kid": "id-token-rsa", "alg": "RS256"}}})
	keys, err := AccessPublicKeys(raw)
	if err != nil || len(keys) != 1 {
		t.Fatalf("mixed profiles: %v", err)
	}
}

func FuzzSecurityJWT(f *testing.F) {
	for _, s := range []string{"", "a.b.c", "eyJhbGciOiJub25lIn0.e30.", ".."} {
		f.Add(s)
	}
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		f.Fatal(err)
	}
	f.Fuzz(func(t *testing.T, raw string) {
		if len(raw) > 16385 {
			t.Skip()
		}
		_, _ = VerifyAccessToken(context.Background(), raw, testVerificationConfig(pub))
	})
}
