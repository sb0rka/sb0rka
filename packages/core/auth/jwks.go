package auth

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	jwksTTL      = 5 * time.Minute
	jwksThrottle = 30 * time.Second
)

// JWKSCache only follows the endpoint derived from the configured trusted issuer.
//
// A cached key keeps verifying tokens after its TTL while Auth is unreachable
// (stale-while-error); a key that was never cached yields ErrKeysUnavailable.
// The network fetch runs outside the mutex and concurrent refreshes are coalesced.
type JWKSCache struct {
	mu          sync.Mutex
	endpoint    string
	http        *http.Client
	now         func() time.Time
	keys        map[string]ed25519.PublicKey
	expires     time.Time
	lastAttempt time.Time
	unavailable bool
	refreshing  chan struct{} // non-nil while a fetch is in flight; closed when it ends
}

// AccessPublicKeys selects only the public access-token signing profile.
func AccessPublicKeys(raw []byte) (map[string]ed25519.PublicKey, error) {
	var document struct {
		Keys []struct{ KTY, CRV, X, KID, Alg, Use string }
	}
	if len(raw) > 1<<20 || json.Unmarshal(raw, &document) != nil {
		return nil, fmt.Errorf("invalid public JWKS")
	}
	keys := make(map[string]ed25519.PublicKey)
	seen := make(map[string]bool)
	for _, k := range document.Keys {
		if k.KID == "" || len(k.KID) > 128 || seen[k.KID] {
			return nil, fmt.Errorf("missing or duplicate key identifier")
		}
		seen[k.KID] = true
		if k.KTY != "OKP" {
			continue
		}
		b, err := base64.RawURLEncoding.DecodeString(k.X)
		if k.CRV != "Ed25519" || k.Alg != "EdDSA" || k.Use != "sig" || err != nil || len(b) != ed25519.PublicKeySize || base64.RawURLEncoding.EncodeToString(b) != k.X {
			return nil, fmt.Errorf("invalid access verification key")
		}
		keys[k.KID] = ed25519.PublicKey(b)
	}
	return keys, nil
}

// ValidateServiceOrigin accepts an absolute origin with no userinfo, path, query,
// or fragment. http is accepted only when allowInsecureHTTP is set, and only for:
// loopback/private hosts, host.docker.internal, or a Docker Compose service name
// (a single DNS label with no dots).
func ValidateServiceOrigin(raw string, allowInsecureHTTP bool) error {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" {
		return fmt.Errorf("must be an absolute origin")
	}
	if u.Scheme == "https" {
		return nil
	}
	if allowInsecureHTTP && u.Scheme == "http" && isDevHTTPHost(u.Hostname()) {
		return nil
	}
	return fmt.Errorf("http is allowed only for loopback or private hosts")
}

// NewJWKSCache accepts an https issuer, or an http issuer only on a loopback or
// private-network host.
func NewJWKSCache(issuer string) (*JWKSCache, error) {
	if err := ValidateServiceOrigin(issuer, true); err != nil {
		return nil, fmt.Errorf("invalid AUTH_ISSUER: %w", err)
	}
	return &JWKSCache{
		endpoint: issuer + "/oauth2/jwks",
		http: &http.Client{
			Timeout:       5 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
		now:  time.Now,
		keys: make(map[string]ed25519.PublicKey),
	}, nil
}

func isLocalHTTPHost(host string) bool {
	if strings.EqualFold(host, "localhost") || strings.EqualFold(host, "host.docker.internal") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && (ip.IsLoopback() || ip.IsPrivate())
}

// isDevHTTPHost is the allow-list used with AUTH_ALLOW_INSECURE_HTTP_ISSUER.
func isDevHTTPHost(host string) bool {
	if isLocalHTTPHost(host) {
		return true
	}
	// Compose service DNS such as "gateway" or "auth".
	return host != "" && !strings.Contains(host, ".")
}

// Key returns the verification key for kid.
func (c *JWKSCache) Key(ctx context.Context, kid string) (ed25519.PublicKey, error) {
	for {
		c.mu.Lock()
		now := c.now()
		key, known := c.keys[kid]
		if known && now.Before(c.expires) {
			c.mu.Unlock()
			return key, nil
		}
		if wait := c.refreshing; wait != nil {
			c.mu.Unlock()
			select {
			case <-wait:
				continue
			case <-ctx.Done():
				return nil, ErrKeysUnavailable
			}
		}
		if now.Sub(c.lastAttempt) < jwksThrottle {
			unavailable := c.unavailable
			c.mu.Unlock()
			switch {
			case known:
				return key, nil
			case unavailable:
				return nil, ErrKeysUnavailable
			default:
				return nil, ErrUnauthorized
			}
		}
		done := make(chan struct{})
		c.refreshing, c.lastAttempt = done, now
		c.mu.Unlock()

		// The fetch is shared by every waiter, so it must not die with this caller's context.
		keys, err := c.fetch(context.WithoutCancel(ctx))

		c.mu.Lock()
		if err == nil {
			c.keys, c.expires, c.unavailable = keys, c.now().Add(jwksTTL), false
		} else {
			c.unavailable = true
		}
		key, known = c.keys[kid]
		c.refreshing = nil
		close(done)
		c.mu.Unlock()

		switch {
		case known:
			return key, nil
		case err != nil:
			return nil, ErrKeysUnavailable
		default:
			return nil, ErrUnauthorized
		}
	}
}

func (c *JWKSCache) fetch(ctx context.Context) (map[string]ed25519.PublicKey, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint, nil)
	if err != nil {
		return nil, err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("jwks endpoint returned %d", res.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, (1<<20)+1))
	if err != nil {
		return nil, err
	}
	keys, err := AccessPublicKeys(raw)
	if err != nil {
		return nil, err
	}
	if len(keys) == 0 {
		return nil, fmt.Errorf("jwks has no access verification keys")
	}
	return keys, nil
}
