package transport

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	"github.com/sb0rka/sb0rka/apps/auth/internal/service"
	"github.com/sb0rka/sb0rka/apps/auth/internal/transport/runtime"
	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
)

func TestAuthMiddlewareRejectsDuplicateAuthorizationWithValidTokens(t *testing.T) {
	cfg := testAuthConfig(t)
	s := &Server{deps: runtime.Dependencies{Cfg: config.ServerConfig{AuthConfig: cfg, OIDC: &config.OIDCConfig{Registry: testRegistry()}}, Log: slog.New(slog.DiscardHandler)}}
	token, err := service.CreateAccessToken(uuid.New(), uuid.New(), coreauth.SubjectUser, cfg)
	if err != nil {
		t.Fatal(err)
	}
	h := s.authMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	for count, want := range map[int]int{1: http.StatusNoContent, 2: http.StatusUnauthorized} {
		r := httptest.NewRequest("GET", "/auth/subject", nil)
		for i := 0; i < count; i++ {
			r.Header.Add("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%d headers: status %d want %d", count, w.Code, want)
		}
	}
}
