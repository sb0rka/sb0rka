package auth

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

type compactTestKeys struct {
	calls int
	key   ed25519.PublicKey
}

func (k *compactTestKeys) Key(context.Context, string) (ed25519.PublicKey, error) {
	k.calls++
	return k.key, nil
}

func TestCompactAccessTokenRejectsAmbiguousClaimsBeforeKeyResolution(t *testing.T) {
	pub, private := newTestKey(t)
	good := strings.Split(signTestToken(t, private, tokenOptions{}), ".")
	header, _ := base64.RawURLEncoding.DecodeString(good[0])
	payload, _ := base64.RawURLEncoding.DecodeString(good[1])
	var claims map[string]json.RawMessage
	if err := json.Unmarshal(payload, &claims); err != nil {
		t.Fatal(err)
	}
	sign := func(h, p string) string {
		message := base64.RawURLEncoding.EncodeToString([]byte(h)) + "." + base64.RawURLEncoding.EncodeToString([]byte(p))
		return message + "." + base64.RawURLEncoding.EncodeToString(ed25519.Sign(private, []byte(message)))
	}
	for name, raw := range map[string]string{
		"duplicate_claim":        sign(string(header), strings.TrimSuffix(string(payload), "}")+`,"sub":"another-subject"}`),
		"case_shadow":            sign(string(header), strings.TrimSuffix(string(payload), "}")+`,"Sub":"another-subject"}`),
		"escaped_shadow":         sign(string(header), strings.TrimSuffix(string(payload), "}")+`,"\u0073ub":"another-subject"}`),
		"duplicate_nested_actor": sign(string(header), strings.TrimSuffix(string(payload), "}")+`,"act":{"sub":"first","sub":"second"}}`),
		"duplicate_header":       sign(strings.TrimSuffix(string(header), "}")+`,"alg":"EdDSA"}`, string(payload)),
		"numeric_string":         sign(string(header), strings.Replace(string(payload), `"exp":`+string(claims["exp"]), `"exp":"`+string(claims["exp"])+`"`, 1)),
		"null_nbf":               sign(string(header), strings.TrimSuffix(string(payload), "}")+`,"nbf":null}`),
		"fractional_iat":         sign(string(header), strings.Replace(string(payload), `"iat":`+string(claims["iat"]), `"iat":1.5`, 1)),
		"extra_segment":          strings.Join(good, ".") + ".extra",
		"padded_signature":       strings.Join(good, ".") + "=",
		"short_signature":        good[0] + "." + good[1] + "." + base64.RawURLEncoding.EncodeToString(make([]byte, 63)),
	} {
		t.Run(name, func(t *testing.T) {
			keys := &compactTestKeys{key: pub}
			cfg := testVerificationConfig(pub)
			cfg.Keys = keys
			if _, err := VerifyAccessToken(context.Background(), raw, cfg); !errors.Is(err, ErrUnauthorized) {
				t.Fatalf("accepted malformed token: %v", err)
			}
			if keys.calls != 0 {
				t.Fatal("malformed envelope reached the key resolver")
			}
		})
	}
	if _, err := VerifyAccessToken(context.Background(), strings.Join(good, "."), testVerificationConfig(pub)); err != nil {
		t.Fatal(err)
	}
}
