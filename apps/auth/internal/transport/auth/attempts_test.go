package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
)

type attemptedLoginDatabase struct {
	*loginDatabase
	consume func(string, int, time.Duration) (time.Duration, error)
}

func (d *attemptedLoginDatabase) AuthenticationAttempt(_ context.Context, bucket string, limit int, window time.Duration) (time.Duration, error) {
	return d.consume(bucket, limit, window)
}

func loginRequest(h *Handler, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.AuthLogin(w, r)
	return w
}

func TestPasswordAttemptsShareAnAccountBudgetAcrossAliases(t *testing.T) {
	h, d := loginFixture()
	d.err = nil
	d.user.ID = uuid.New()
	d.user.IsActive = true
	counts := map[string]int{}
	h.deps.Database = &attemptedLoginDatabase{d, func(bucket string, limit int, window time.Duration) (time.Duration, error) {
		counts[bucket]++
		if counts[bucket] > limit {
			return window, nil
		}
		return 0, nil
	}}
	verifications := 0
	h.verifyPassword = func(string, string, config.AuthConfig) (bool, error) { verifications++; return false, nil }
	for i := 0; i < 11; i++ {
		body := `{"username":"someone","password":"password"}`
		if i%2 == 1 {
			body = `{"email":"someone@example.test","password":"password"}`
		}
		w := loginRequest(h, body)
		want := http.StatusUnauthorized
		if i == 10 {
			want = http.StatusTooManyRequests
		}
		if w.Code != want {
			t.Fatalf("attempt %d: status %d, want %d", i, w.Code, want)
		}
		if i == 10 && w.Header().Get("Retry-After") == "" {
			t.Fatal("missing Retry-After")
		}
	}
	if verifications != 10 || counts["subject:"+d.user.ID.String()] != 11 {
		t.Fatal("alias bypassed account budget")
	}
}

func TestPasswordAttemptStoreFailureClosesAuthentication(t *testing.T) {
	h, d := loginFixture()
	h.deps.Database = &attemptedLoginDatabase{d, func(string, int, time.Duration) (time.Duration, error) { return 0, errors.New("offline") }}
	h.verifyPassword = func(string, string, config.AuthConfig) (bool, error) {
		t.Fatal("password work reached after rate-store error")
		return false, nil
	}
	w := loginRequest(h, `{"username":"someone","password":"password"}`)
	if w.Code != http.StatusServiceUnavailable || d.calls != 0 {
		t.Fatal("rate-store failure opened authentication")
	}
}

func TestIdentityJSONLimitsBeforeCredentialWork(t *testing.T) {
	for name, body := range map[string]string{
		"oversized": `{"username":"someone","password":"password"}` + strings.Repeat(" ", 16384),
		"multiple":  `{"username":"someone","password":"password"} {}`,
		"unknown":   `{"username":"someone","password":"password","admin":true}`,
	} {
		t.Run(name, func(t *testing.T) {
			h, d := loginFixture()
			w := loginRequest(h, body)
			want := http.StatusBadRequest
			if name == "oversized" {
				want = http.StatusRequestEntityTooLarge
			}
			if w.Code != want || d.calls != 0 {
				t.Fatalf("status=%d; credential queries=%d", w.Code, d.calls)
			}
		})
	}
}
