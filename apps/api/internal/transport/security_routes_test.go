package transport

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/api/internal/authz"
	"github.com/sb0rka/sb0rka/apps/api/internal/config"
	"github.com/sb0rka/sb0rka/apps/api/internal/transport/runtime"
	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
)

type securityDenyAuthorizer struct{ calls int }

func (a *securityDenyAuthorizer) Authorize(context.Context, authz.Principal, authz.Action, authz.ResourceRef) (*authz.AuthorizationDecision, error) {
	a.calls++
	return &authz.AuthorizationDecision{Allowed: false}, nil
}

// Exercise the real router and handlers with a valid signature and live session.
// Unimplemented backend methods panic, exposing accidental data access before
// the deliberately denying authorizer has been consulted.
func TestSecurityProjectRoutesEnforceAuthorization(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	keys := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []any{map[string]string{"kty": "OKP", "crv": "Ed25519", "alg": "EdDSA", "use": "sig", "kid": "routing", "x": base64.RawURLEncoding.EncodeToString(pub)}}})
	}))
	defer keys.Close()
	cache, err := coreauth.NewJWKSCache(keys.URL)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	id := uuid.New()
	c := coreauth.AccessTokenClaims{SubjectKind: "user", SessionID: uuid.NewString(), ClientID: coreauth.ClientConsole, RegisteredClaims: jwt.RegisteredClaims{Issuer: keys.URL, Subject: id.String(), Audience: jwt.ClaimStrings{coreauth.AudienceAPI}, ID: uuid.NewString(), IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(time.Minute))}}
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, c)
	token.Header["kid"] = "routing"
	token.Header["typ"] = coreauth.AccessTokenType
	signed, err := token.SignedString(priv)
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile("router.go")
	if err != nil {
		t.Fatal(err)
	}
	pattern := regexp.MustCompile("mux.Handle\\(\"([A-Z]+) (/projects/[^\\\"]+)\"")
	routes := pattern.FindAllStringSubmatch(string(data), -1)
	if len(routes) < 35 {
		t.Fatal("route inventory unexpectedly incomplete")
	}
	for _, route := range routes {
		method, path := route[1], route[2]
		if !strings.Contains(path, "{project_id}") {
			continue
		}
		t.Run(method+" "+path, func(t *testing.T) {
			a := new(securityDenyAuthorizer)
			d := &securityDatabase{live: true, registered: true, delegation: true, bound: true}
			s := NewServer(runtime.Dependencies{PlatformDatabase: d, Authorizer: a, Log: slog.New(slog.DiscardHandler), Cfg: config.ServerConfig{AuthConfig: config.AuthConfig{VerificationKeys: cache, AccessTokenIssuer: keys.URL, AccessTokenAudience: coreauth.AudienceAPI}}})
			h := s.BuildCommonHandler()
			actual := strings.NewReplacer("{project_id}", "abcdef0123", "{resource_id}", "abcdef012345", "{subject_id}", id.String(), "{version_no}", "1", "{tag_id}", "1").Replace(path)
			r := httptest.NewRequest(method, actual, strings.NewReader("{}"))
			r.Header.Set("Content-Type", "application/json")
			r.Header.Set("Authorization", "Bearer "+signed)
			w := httptest.NewRecorder()
			(*h).ServeHTTP(w, r)
			if w.Code != 403 || a.calls != 1 {
				t.Fatalf("denied authorizer calls=%d status=%d; expected one check and 403", a.calls, w.Code)
			}
		})
	}
}
