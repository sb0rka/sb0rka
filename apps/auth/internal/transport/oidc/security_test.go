package oidc

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
)

func securityClient() config.RegisteredClient {
	enabled := true
	return config.RegisteredClient{ClientID: "audit-web", Enabled: &enabled, Type: "confidential", AuthMethod: "client_secret_basic", Secrets: [][]byte{bytes.Repeat([]byte("s"), 32)}, RedirectURIs: []string{"https://client.example/callback"}, OIDCScopes: []string{"openid", "profile", "email", "offline_access"}, AccessAudience: coreauth.AudienceSOM, GrantTypes: []string{"authorization_code", "refresh_token"}}
}

func securityQuery() url.Values {
	return url.Values{"client_id": {"audit-web"}, "response_type": {"code"}, "redirect_uri": {"https://client.example/callback"}, "scope": {"openid profile email offline_access"}, "state": {"state-unique"}, "nonce": {strings.Repeat("A", 43)}, "code_challenge": {strings.Repeat("A", 43)}, "code_challenge_method": {"S256"}}
}

func TestSecurityAuthorizationProtocol(t *testing.T) {
	client := securityClient()
	if _, problem, _ := validateAuthorizationRequest(securityQuery().Encode(), client); problem != nil {
		t.Fatal(problem)
	}
	cases := map[string]func(url.Values){
		"foreign_client":     func(v url.Values) { v.Set("client_id", "other") },
		"no_nonce":           func(v url.Values) { v.Del("nonce") },
		"noncanonical_nonce": func(v url.Values) { v.Set("nonce", strings.Repeat("A", 42)+"B") },
		"no_state":           func(v url.Values) { v.Del("state") },
		"plain_pkce":         func(v url.Values) { v.Set("code_challenge_method", "plain") },
		"no_pkce":            func(v url.Values) { v.Del("code_challenge") },
		"implicit":           func(v url.Values) { v.Set("response_type", "token") },
		"extra_scope":        func(v url.Values) { v.Set("scope", "openid admin") },
		"duplicate_scope":    func(v url.Values) { v.Set("scope", "openid openid") },
		"request_uri":        func(v url.Values) { v.Set("request_uri", "https://attacker.example/jar") },
		"duplicate_client":   func(v url.Values) { v.Add("client_id", "other") },
		"duplicate_redirect": func(v url.Values) { v.Add("redirect_uri", "https://attacker.example") },
	}
	for _, redirect := range []string{"https://client.example.evil/callback", "https://client.example@evil.example/callback", "https://client.example/callback/", "https://client.example:443/callback", "https://client.example/%63allback", "https://client.example/callback?extra=1", "https://client.example/callback#fragment", "//client.example/callback"} {
		redirect := redirect
		cases["redirect_"+redirect] = func(v url.Values) { v.Set("redirect_uri", redirect) }
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			v := securityQuery()
			mutate(v)
			_, problem, canRedirect := validateAuthorizationRequest(v.Encode(), client)
			if problem == nil {
				t.Fatal("invalid authorization accepted")
			}
			if strings.HasPrefix(name, "redirect_") && canRedirect {
				t.Fatal("untrusted redirect allowed")
			}
		})
	}
}

func TestSecurityOAuthFormAmbiguity(t *testing.T) {
	allowed := map[string]struct{}{"grant_type": {}, "code": {}}
	for _, tc := range []struct {
		name, body, contentType, path string
		valid                         bool
	}{
		{"valid", "grant_type=authorization_code&code=x", "application/x-www-form-urlencoded", "/token", true},
		{"duplicates", "grant_type=authorization_code&grant_type=refresh_token", "application/x-www-form-urlencoded", "/token", false},
		{"unknown", "grant_type=x&client_secret=secret", "application/x-www-form-urlencoded", "/token", false},
		{"query", "grant_type=x", "application/x-www-form-urlencoded", "/token?code=x", false},
		{"json", "{}", "application/json", "/token", false},
		{"malformed_encoding", "code=%zz", "application/x-www-form-urlencoded", "/token", false},
		{"oversize", strings.Repeat("x", maxFormBytes+1), "application/x-www-form-urlencoded", "/token", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", tc.path, strings.NewReader(tc.body))
			r.Header.Set("Content-Type", tc.contentType)
			_, problem := parseFormRequest(httptest.NewRecorder(), r, allowed)
			if (problem == nil) != tc.valid {
				t.Fatalf("valid=%v problem=%v", tc.valid, problem)
			}
		})
	}
}

func TestSecurityCredentialPurposeBinding(t *testing.T) {
	p := newCredentialProtector(config.OIDCConfig{ProviderCryptoKey: bytes.Repeat([]byte("k"), 32), CodeHMACKey: bytes.Repeat([]byte("h"), 32)})
	id := uuid.New()
	opaque, err := p.sealAuthRequestID(id)
	if err != nil {
		t.Fatal(err)
	}
	if got, err := p.openAuthRequestID(opaque); err != nil || got != id {
		t.Fatal("control request failed")
	}
	code, hash, err := p.newAuthorizationCode()
	if err != nil || len(hash) != 32 {
		t.Fatal("control code failed")
	}
	if err := p.validateAuthorizationCode(code); err != nil {
		t.Fatal(err)
	}
	if err := p.validateAuthorizationCode(opaque); !errors.Is(err, db.ErrOIDCInvalidGrant) {
		t.Fatal("request envelope accepted as code")
	}
	if _, err := p.openAuthRequestID(code); err == nil {
		t.Fatal("code accepted as request envelope")
	}
	for _, purpose := range []string{"refresh_result:client:operation", "delegation_consent:request:session"} {
		sealed, err := p.seal(purpose, []byte("fixture"))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := p.open(purpose+":other", sealed); err == nil {
			t.Fatal("ciphertext accepted with another purpose")
		}
	}
	parts := strings.Split(opaque, ".")
	raw, _ := base64.RawURLEncoding.DecodeString(parts[1])
	raw[len(raw)-1] ^= 1
	if _, err := p.openAuthRequestID(parts[0] + "." + base64.RawURLEncoding.EncodeToString(raw)); err == nil {
		t.Fatal("tampered request envelope accepted")
	}
}

func TestSecurityIDTokenBinding(t *testing.T) {
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	rsaKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Truncate(time.Second)
	client := securityClient()
	cfg := config.OIDCConfig{Issuer: "https://issuer.example", SigningKeyID: "id-key", SigningPrivateKey: rsaKey}
	authCfg := config.AuthConfig{AccessTokenPrivateKey: priv, AccessTokenKid: "access-key", AccessTokenIssuer: cfg.Issuer, AccessTokenTTL: 5 * time.Minute}
	user := db.OIDCUserClaims{ID: uuid.New(), Username: "audit", Email: "audit@example.test", EmailVerified: true, Nonce: strings.Repeat("A", 43), Scopes: "openid profile email", AuthenticationTime: now.Add(-time.Minute)}
	tokens, err := newTokenIssuer(cfg, authCfg).Issue(user, uuid.New(), now, client)
	if err != nil {
		t.Fatal(err)
	}
	claims := new(idTokenClaims)
	token, err := jwt.ParseWithClaims(tokens.IDToken, claims, func(token *jwt.Token) (any, error) { return &rsaKey.PublicKey, nil }, jwt.WithValidMethods([]string{"RS256"}), jwt.WithIssuer(cfg.Issuer), jwt.WithAudience(client.ClientID), jwt.WithExpirationRequired())
	if err != nil || !token.Valid {
		t.Fatalf("ID-token signature: %v", err)
	}
	sum := sha256.Sum256([]byte(tokens.AccessToken))
	if claims.Nonce != user.Nonce || claims.Subject != user.ID.String() || claims.AuthenticationTime != user.AuthenticationTime.Unix() || claims.AccessTokenHash != base64.RawURLEncoding.EncodeToString(sum[:16]) {
		t.Fatal("ID-token binding failed")
	}
	if _, err := coreauth.VerifyAccessToken(t.Context(), tokens.IDToken, coreauth.VerificationConfig{PublicKey: priv.Public().(ed25519.PublicKey), KeyID: "access-key", Issuer: cfg.Issuer, Audience: coreauth.AudienceAPI}); err == nil {
		t.Fatal("ID-token accepted as access token")
	}
}

func FuzzSecurityAuthorization(f *testing.F) {
	f.Add(securityQuery().Encode())
	f.Add("%zz")
	f.Add("client_id=x&client_id=y")
	f.Fuzz(func(t *testing.T, query string) {
		if len(query) > 8193 {
			t.Skip()
		}
		_, _, _ = validateAuthorizationRequest(query, securityClient())
	})
}
