package auth

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	testIssuer = "https://auth.sb0rka.internal"
	testKID    = "test-kid"
)

var testNow = time.Date(2026, time.November, 3, 12, 0, 0, 0, time.UTC)

type tokenOptions struct {
	method   jwt.SigningMethod
	key      any
	kid      string
	typ      string
	audience []string
	issuedAt time.Time
	ttl      time.Duration
	mutate   func(*AccessTokenClaims)
}

func newTestKey(t *testing.T) (ed25519.PublicKey, ed25519.PrivateKey) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return pub, priv
}

func signTestToken(t *testing.T, priv ed25519.PrivateKey, opts tokenOptions) string {
	t.Helper()
	if opts.method == nil {
		opts.method = jwt.SigningMethodEdDSA
	}
	if opts.key == nil {
		opts.key = priv
	}
	if opts.kid == "" {
		opts.kid = testKID
	}
	if opts.typ == "" {
		opts.typ = AccessTokenType
	}
	if opts.audience == nil {
		opts.audience = []string{AudienceAPI}
	}
	if opts.issuedAt.IsZero() {
		opts.issuedAt = testNow
	}
	if opts.ttl == 0 {
		opts.ttl = 5 * time.Minute
	}
	claims := &AccessTokenClaims{
		SessionID:   uuid.NewString(),
		SubjectKind: SubjectUser,
		ClientID:    ClientConsole,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    testIssuer,
			Subject:   uuid.NewString(),
			Audience:  opts.audience,
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(opts.issuedAt),
			ExpiresAt: jwt.NewNumericDate(opts.issuedAt.Add(opts.ttl)),
		},
	}
	if opts.mutate != nil {
		opts.mutate(claims)
	}
	token := jwt.NewWithClaims(opts.method, claims)
	token.Header["kid"] = opts.kid
	token.Header["typ"] = opts.typ
	raw, err := token.SignedString(opts.key)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func testVerificationConfig(pub ed25519.PublicKey) VerificationConfig {
	return VerificationConfig{
		PublicKey: pub,
		KeyID:     testKID,
		Issuer:    testIssuer,
		Audience:  AudienceAPI,
		Now:       func() time.Time { return testNow },
	}
}

type staticKeys map[string]ed25519.PublicKey

func (k staticKeys) Key(_ context.Context, kid string) (ed25519.PublicKey, error) {
	if key, ok := k[kid]; ok {
		return key, nil
	}
	return nil, ErrUnauthorized
}

type failingKeys struct{}

func (failingKeys) Key(context.Context, string) (ed25519.PublicKey, error) {
	return nil, ErrKeysUnavailable
}

func TestVerifyAccessToken(t *testing.T) {
	pub, priv := newTestKey(t)
	_, otherPriv := newTestKey(t)

	tests := []struct {
		name string
		opts tokenOptions
		want error
	}{
		{name: "valid user token"},
		{name: "wrong audience", opts: tokenOptions{audience: []string{AudienceSOM}}, want: ErrUnauthorized},
		{name: "extra audience", opts: tokenOptions{audience: []string{AudienceAPI, AudienceSOM}}, want: ErrUnauthorized},
		{name: "wrong typ", opts: tokenOptions{typ: "JWT"}, want: ErrUnauthorized},
		{name: "legacy typ", opts: tokenOptions{typ: "access+jwt"}, want: ErrUnauthorized},
		{name: "wrong alg", opts: tokenOptions{method: jwt.SigningMethodHS256, key: []byte("0123456789abcdef0123456789abcdef")}, want: ErrUnauthorized},
		{name: "unknown kid", opts: tokenOptions{kid: "other-kid"}, want: ErrUnauthorized},
		{name: "signed by another key", opts: tokenOptions{key: otherPriv}, want: ErrUnauthorized},
		{name: "ttl above maximum", opts: tokenOptions{ttl: MaxAccessTokenTTL + time.Second}, want: ErrUnauthorized},
		{name: "ttl at maximum", opts: tokenOptions{ttl: MaxAccessTokenTTL}},
		{name: "expired beyond skew", opts: tokenOptions{issuedAt: testNow.Add(-10 * time.Minute), ttl: time.Minute}, want: ErrUnauthorized},
		{name: "issued in the future beyond skew", opts: tokenOptions{issuedAt: testNow.Add(ClockSkew + time.Minute)}, want: ErrUnauthorized},
		{name: "wrong issuer", opts: tokenOptions{mutate: func(c *AccessTokenClaims) { c.Issuer = "https://evil.sb0rka.internal" }}, want: ErrUnauthorized},
		{name: "unknown subject kind", opts: tokenOptions{mutate: func(c *AccessTokenClaims) { c.SubjectKind = "robot" }}, want: ErrUnauthorized},
		{name: "user without session", opts: tokenOptions{mutate: func(c *AccessTokenClaims) { c.SessionID = "" }}, want: ErrUnauthorized},
		{name: "delegation fields without actor", opts: tokenOptions{mutate: func(c *AccessTokenClaims) { c.DelegationID = uuid.NewString() }}, want: ErrUnauthorized},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			raw := signTestToken(t, priv, tt.opts)
			identity, err := VerifyAccessToken(context.Background(), raw, testVerificationConfig(pub))
			if tt.want != nil {
				if !errors.Is(err, tt.want) {
					t.Fatalf("error = %v, want %v", err, tt.want)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if identity.SubjectKind != SubjectUser || identity.ClientID != ClientConsole || identity.SessionID == "" || identity.JTI == "" {
				t.Fatalf("unexpected identity: %+v", identity)
			}
		})
	}
}

func TestVerifyAccessTokenDelegated(t *testing.T) {
	pub, priv := newTestKey(t)
	delegated := func(c *AccessTokenClaims) {
		c.ClientID = ClientSOMWeb
		c.Actor = &Actor{SubjectID: uuid.NewString()}
		c.Scope = ScopeProjectsRead
		c.DelegationID = uuid.NewString()
		c.DelegationVersion = 1
		c.ProjectIDs = []string{uuid.NewString()}
	}
	identity, err := VerifyAccessToken(context.Background(), signTestToken(t, priv, tokenOptions{mutate: delegated}), testVerificationConfig(pub))
	if err != nil {
		t.Fatal(err)
	}
	if identity.ActorSubjectID == "" || identity.Scope != ScopeProjectsRead || identity.DelegationVersion != 1 || len(identity.ProjectIDs) != 1 {
		t.Fatalf("unexpected delegated identity: %+v", identity)
	}

	incomplete := func(c *AccessTokenClaims) { delegated(c); c.ProjectIDs = nil }
	if _, err = VerifyAccessToken(context.Background(), signTestToken(t, priv, tokenOptions{mutate: incomplete}), testVerificationConfig(pub)); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("delegated token without projects: error = %v, want %v", err, ErrUnauthorized)
	}
}

func TestVerifyAccessTokenAgent(t *testing.T) {
	pub, priv := newTestKey(t)
	agent := func(c *AccessTokenClaims) {
		c.SubjectKind = SubjectAgent
		c.ClientID = ClientSOMWorkload
		c.SessionID = ""
		c.HostID = uuid.NewString()
		c.KeyThumbprint = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
		c.Scope = ScopeRelayConnect
	}
	cfg := testVerificationConfig(pub)
	cfg.Audience = AudienceRelay
	opts := tokenOptions{audience: []string{AudienceRelay}, mutate: agent}
	identity, err := VerifyAccessToken(context.Background(), signTestToken(t, priv, opts), cfg)
	if err != nil {
		t.Fatal(err)
	}
	if identity.SubjectKind != SubjectAgent || identity.HostID == "" {
		t.Fatalf("unexpected agent identity: %+v", identity)
	}

	opts.mutate = func(c *AccessTokenClaims) { agent(c); c.Scope = ScopeProjectsRead }
	if _, err = VerifyAccessToken(context.Background(), signTestToken(t, priv, opts), cfg); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("agent with wrong scope: error = %v, want %v", err, ErrUnauthorized)
	}

	apiAgent := func(c *AccessTokenClaims) {
		agent(c)
		c.Scope = AgentAPIScope
	}
	cfg.Audience = AudienceAPI
	opts = tokenOptions{audience: []string{AudienceAPI}, mutate: apiAgent}
	identity, err = VerifyAccessToken(context.Background(), signTestToken(t, priv, opts), cfg)
	if err != nil {
		t.Fatal(err)
	}
	if identity.Scope != AgentAPIScope {
		t.Fatalf("api agent scope = %q", identity.Scope)
	}
	opts.mutate = func(c *AccessTokenClaims) { apiAgent(c); c.Scope = ScopeRelayConnect }
	if _, err = VerifyAccessToken(context.Background(), signTestToken(t, priv, opts), cfg); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("relay scope on api audience: error = %v, want %v", err, ErrUnauthorized)
	}
}

func TestVerifyAccessTokenKeyProvider(t *testing.T) {
	pub, priv := newTestKey(t)
	cfg := testVerificationConfig(nil)
	cfg.Keys = staticKeys{testKID: pub}
	raw := signTestToken(t, priv, tokenOptions{})
	if _, err := VerifyAccessToken(context.Background(), raw, cfg); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	cfg.Keys = staticKeys{}
	if _, err := VerifyAccessToken(context.Background(), raw, cfg); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("unknown kid: error = %v, want %v", err, ErrUnauthorized)
	}

	cfg.Keys = failingKeys{}
	if _, err := VerifyAccessToken(context.Background(), raw, cfg); !errors.Is(err, ErrKeysUnavailable) {
		t.Fatalf("keys outage: error = %v, want %v", err, ErrKeysUnavailable)
	}
}

func TestVerifyAccessTokenPreviousKeys(t *testing.T) {
	pub, priv := newTestKey(t)
	current, _ := newTestKey(t)
	cfg := testVerificationConfig(current)
	cfg.PreviousPublicKeys = map[string]ed25519.PublicKey{testKID: pub}
	cfg.KeyID = "current-kid"
	if _, err := VerifyAccessToken(context.Background(), signTestToken(t, priv, tokenOptions{}), cfg); err != nil {
		t.Fatalf("previous key should verify: %v", err)
	}
}

func TestParseBearerToken(t *testing.T) {
	for _, header := range []string{"", "Bearer", "Basic abc", "Bearer a b"} {
		if _, err := ParseBearerToken(header); !errors.Is(err, ErrUnauthorized) {
			t.Fatalf("%q: error = %v, want %v", header, err, ErrUnauthorized)
		}
	}
	if raw, err := ParseBearerToken("bearer abc"); err != nil || raw != "abc" {
		t.Fatalf("raw = %q, err = %v", raw, err)
	}
}
