package auth

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type jwksServer struct {
	*httptest.Server
	hits   atomic.Int32
	down   atomic.Bool
	mu     sync.Mutex
	body   []byte
	gate   chan struct{}
	status int
}

func newJWKSServer(t *testing.T, keys map[string]ed25519.PublicKey) *jwksServer {
	t.Helper()
	s := &jwksServer{status: http.StatusOK}
	s.setKeys(keys)
	s.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.hits.Add(1)
		if r.URL.Path != "/oauth2/jwks" {
			http.NotFound(w, r)
			return
		}
		s.mu.Lock()
		gate, body, status := s.gate, s.body, s.status
		s.mu.Unlock()
		if gate != nil {
			<-gate
		}
		if s.down.Load() {
			http.Error(w, "down", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(status)
		_, _ = w.Write(body)
	}))
	t.Cleanup(s.Close)
	return s
}

func (s *jwksServer) setKeys(keys map[string]ed25519.PublicKey) {
	type jwk struct {
		KTY string `json:"kty"`
		CRV string `json:"crv"`
		X   string `json:"x"`
		KID string `json:"kid"`
		Alg string `json:"alg"`
		Use string `json:"use"`
	}
	doc := struct {
		Keys []jwk `json:"keys"`
	}{Keys: []jwk{}}
	for kid, key := range keys {
		doc.Keys = append(doc.Keys, jwk{KTY: "OKP", CRV: "Ed25519", X: base64.RawURLEncoding.EncodeToString(key), KID: kid, Alg: "EdDSA", Use: "sig"})
	}
	raw, err := json.Marshal(doc)
	if err != nil {
		panic(err)
	}
	s.mu.Lock()
	s.body = raw
	s.mu.Unlock()
}

type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	c.now = c.now.Add(d)
	c.mu.Unlock()
}

func newTestCache(t *testing.T, s *jwksServer) (*JWKSCache, *fakeClock) {
	t.Helper()
	cache, err := NewJWKSCache(s.URL)
	if err != nil {
		t.Fatal(err)
	}
	clock := &fakeClock{now: testNow}
	cache.now = clock.Now
	return cache, clock
}

func TestNewJWKSCacheIssuer(t *testing.T) {
	tests := []struct {
		issuer string
		ok     bool
	}{
		{"https://auth.sb0rka.internal", true},
		{"https://auth.sb0rka.internal:8443", true},
		{"http://localhost:8020", true},
		{"http://127.0.0.1:8020", true},
		{"http://[::1]:8020", true},
		{"http://10.0.0.5:8020", true},
		{"http://192.168.1.10", true},
		{"http://auth.sb0rka.internal", false},
		{"http://8.8.8.8", false},
		{"http://localhost.evil.com", false},
		{"ftp://localhost", false},
		{"https://user@auth.sb0rka.internal", false},
		{"https://auth.sb0rka.internal/", false},
		{"https://auth.sb0rka.internal/path", false},
		{"https://auth.sb0rka.internal?x=1", false},
		{"https://auth.sb0rka.internal#frag", false},
		{"auth.sb0rka.internal", false},
		{"", false},
	}
	for _, tt := range tests {
		t.Run(tt.issuer, func(t *testing.T) {
			cache, err := NewJWKSCache(tt.issuer)
			if tt.ok && (err != nil || cache == nil) {
				t.Fatalf("expected issuer to be accepted, got %v", err)
			}
			if !tt.ok && err == nil {
				t.Fatal("expected issuer to be rejected")
			}
		})
	}
}

func TestJWKSCacheKey(t *testing.T) {
	pub, _ := newTestKey(t)
	server := newJWKSServer(t, map[string]ed25519.PublicKey{testKID: pub})
	cache, clock := newTestCache(t, server)
	ctx := context.Background()

	key, err := cache.Key(ctx, testKID)
	if err != nil || !key.Equal(pub) {
		t.Fatalf("key = %x, err = %v", key, err)
	}
	if _, err = cache.Key(ctx, testKID); err != nil || server.hits.Load() != 1 {
		t.Fatalf("second lookup must be served from cache: hits = %d, err = %v", server.hits.Load(), err)
	}

	// An unknown kid inside the throttle window must not hit the network.
	if _, err = cache.Key(ctx, "unknown"); !errors.Is(err, ErrUnauthorized) || server.hits.Load() != 1 {
		t.Fatalf("unknown kid: hits = %d, err = %v", server.hits.Load(), err)
	}

	// After the throttle the cache refreshes once and still rejects the kid with 401, not 503.
	clock.Advance(jwksThrottle + time.Second)
	if _, err = cache.Key(ctx, "unknown"); !errors.Is(err, ErrUnauthorized) || server.hits.Load() != 2 {
		t.Fatalf("unknown kid after throttle: hits = %d, err = %v", server.hits.Load(), err)
	}
}

func TestJWKSCacheStaleWhileError(t *testing.T) {
	pub, _ := newTestKey(t)
	server := newJWKSServer(t, map[string]ed25519.PublicKey{testKID: pub})
	cache, clock := newTestCache(t, server)
	ctx := context.Background()

	if _, err := cache.Key(ctx, testKID); err != nil {
		t.Fatal(err)
	}

	// Auth goes down and the TTL expires: the cached key keeps working.
	server.down.Store(true)
	clock.Advance(jwksTTL + time.Minute)
	key, err := cache.Key(ctx, testKID)
	if err != nil || !key.Equal(pub) {
		t.Fatalf("stale key must be served during outage: key = %x, err = %v", key, err)
	}
	hits := server.hits.Load()
	if hits != 2 {
		t.Fatalf("expected one failed refresh attempt, hits = %d", hits)
	}
	if _, err = cache.Key(ctx, testKID); err != nil || server.hits.Load() != hits {
		t.Fatalf("failed refresh must be throttled: hits = %d, err = %v", server.hits.Load(), err)
	}

	// A kid that was never cached is unavailable (503), not unauthorized.
	clock.Advance(jwksThrottle + time.Second)
	if _, err = cache.Key(ctx, "never-cached"); !errors.Is(err, ErrKeysUnavailable) {
		t.Fatalf("missing key during outage: error = %v, want %v", err, ErrKeysUnavailable)
	}

	// Once Auth recovers the cache refreshes again, including rotated keys.
	rotated, _ := newTestKey(t)
	server.setKeys(map[string]ed25519.PublicKey{"rotated": rotated})
	server.down.Store(false)
	clock.Advance(jwksThrottle + time.Second)
	if key, err = cache.Key(ctx, "rotated"); err != nil || !key.Equal(rotated) {
		t.Fatalf("rotated key after recovery: key = %x, err = %v", key, err)
	}
	if _, err = cache.Key(ctx, testKID); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("retired key after successful refresh: error = %v, want %v", err, ErrUnauthorized)
	}
}

func TestJWKSCacheColdStartOutage(t *testing.T) {
	server := newJWKSServer(t, nil)
	server.down.Store(true)
	cache, _ := newTestCache(t, server)
	if _, err := cache.Key(context.Background(), testKID); !errors.Is(err, ErrKeysUnavailable) {
		t.Fatalf("error = %v, want %v", err, ErrKeysUnavailable)
	}
}

func TestJWKSCacheEmptyKeySetIsUnavailable(t *testing.T) {
	server := newJWKSServer(t, map[string]ed25519.PublicKey{})
	cache, _ := newTestCache(t, server)
	if _, err := cache.Key(context.Background(), testKID); !errors.Is(err, ErrKeysUnavailable) {
		t.Fatalf("error = %v, want %v", err, ErrKeysUnavailable)
	}
}

func TestJWKSCacheRefreshDoesNotFollowRedirects(t *testing.T) {
	target := newJWKSServer(t, nil)
	redirect := httptest.NewServer(http.RedirectHandler(target.URL+"/oauth2/jwks", http.StatusFound))
	defer redirect.Close()
	cache, err := NewJWKSCache(redirect.URL)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = cache.Key(context.Background(), testKID); !errors.Is(err, ErrKeysUnavailable) || target.hits.Load() != 0 {
		t.Fatalf("redirect must not be followed: hits = %d, err = %v", target.hits.Load(), err)
	}
}

func TestJWKSCacheCoalescesConcurrentRefreshes(t *testing.T) {
	pub, _ := newTestKey(t)
	server := newJWKSServer(t, map[string]ed25519.PublicKey{testKID: pub})
	gate := make(chan struct{})
	server.mu.Lock()
	server.gate = gate
	server.mu.Unlock()
	cache, _ := newTestCache(t, server)

	const callers = 16
	var wg sync.WaitGroup
	errs := make(chan error, callers)
	for range callers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			key, err := cache.Key(context.Background(), testKID)
			if err == nil && !key.Equal(pub) {
				err = errors.New("wrong key")
			}
			errs <- err
		}()
	}

	deadline := time.Now().Add(5 * time.Second)
	for server.hits.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	time.Sleep(50 * time.Millisecond) // let the other callers queue behind the in-flight fetch
	close(gate)
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if hits := server.hits.Load(); hits != 1 {
		t.Fatalf("concurrent lookups must share one fetch, hits = %d", hits)
	}
}

func TestJWKSCacheWaiterHonoursContext(t *testing.T) {
	pub, _ := newTestKey(t)
	server := newJWKSServer(t, map[string]ed25519.PublicKey{testKID: pub})
	gate := make(chan struct{})
	server.mu.Lock()
	server.gate = gate
	server.mu.Unlock()
	cache, _ := newTestCache(t, server)

	leader := make(chan error, 1)
	go func() {
		_, err := cache.Key(context.Background(), testKID)
		leader <- err
	}()
	for server.hits.Load() == 0 {
		time.Sleep(time.Millisecond)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if _, err := cache.Key(ctx, testKID); !errors.Is(err, ErrKeysUnavailable) {
		t.Fatalf("waiter error = %v, want %v", err, ErrKeysUnavailable)
	}
	close(gate)
	if err := <-leader; err != nil {
		t.Fatalf("leader error = %v", err)
	}
}

func TestJWKSCacheVerifiesTokensThroughOutage(t *testing.T) {
	pub, priv := newTestKey(t)
	server := newJWKSServer(t, map[string]ed25519.PublicKey{testKID: pub})
	cache, clock := newTestCache(t, server)
	cfg := testVerificationConfig(nil)
	cfg.Keys = cache
	raw := signTestToken(t, priv, tokenOptions{})

	if _, err := VerifyAccessToken(context.Background(), raw, cfg); err != nil {
		t.Fatal(err)
	}
	server.down.Store(true)
	clock.Advance(jwksTTL + time.Minute)
	if _, err := VerifyAccessToken(context.Background(), raw, cfg); err != nil {
		t.Fatalf("token signed by a cached key must verify during outage: %v", err)
	}
	unknown := signTestToken(t, priv, tokenOptions{kid: "never-cached"})
	if _, err := VerifyAccessToken(context.Background(), unknown, cfg); !errors.Is(err, ErrKeysUnavailable) {
		t.Fatalf("error = %v, want %v", err, ErrKeysUnavailable)
	}
}

func TestValidateServiceOrigin(t *testing.T) {
	accepted := []string{
		"https://auth.sb0rka.internal",
		"http://127.0.0.1:8080",
		"http://10.1.2.3",
		"http://host.docker.internal:8020",
		"http://gateway:8091",
	}
	for _, raw := range accepted {
		if err := ValidateServiceOrigin(raw, true); err != nil {
			t.Fatalf("%s: %v", raw, err)
		}
	}
	rejected := []string{
		"http://gateway.internal",
		"http://auth.sb0rka.internal",
		"https://auth.sb0rka.internal/path",
	}
	for _, raw := range rejected {
		if err := ValidateServiceOrigin(raw, true); err == nil {
			t.Fatalf("%s was accepted", raw)
		}
	}
	if err := ValidateServiceOrigin("http://127.0.0.1:8080", false); err == nil {
		t.Fatal("http without the development flag was accepted")
	}
	if err := ValidateServiceOrigin("http://gateway:8091", false); err == nil {
		t.Fatal("compose DNS without the development flag was accepted")
	}
}
