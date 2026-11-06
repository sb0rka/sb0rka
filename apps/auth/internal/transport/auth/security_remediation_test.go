package auth

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
	"github.com/sb0rka/sb0rka/apps/auth/internal/transport/runtime"
)

type loginDatabase struct {
	db.Database
	user  model.User
	err   error
	calls int
}

func (d *loginDatabase) AuthenticationAttempt(context.Context, string, int, time.Duration) (time.Duration, error) {
	return 0, nil
}

func (d *loginDatabase) GetUser(context.Context, string, string, string) (model.User, error) {
	d.calls++
	return d.user, d.err
}
func loginFixture() (*Handler, *loginDatabase) {
	d := &loginDatabase{err: db.ErrUserNotFound}
	cfg := config.ServerConfig{CORSWhitelist: map[string]bool{"http://console.example": true, "*": true}, AuthConfig: config.AuthConfig{ArgonTime: 1, ArgonMemory: 8, ArgonThreads: 1, ArgonKeyLen: 16, SaltLen: 16}}
	return NewHandler(runtime.Dependencies{Database: d, Cfg: cfg, Log: slog.New(slog.NewTextHandler(io.Discard, nil))}), d
}
func TestSecurityCookieRequestGuards(t *testing.T) {
	for _, endpoint := range []string{"login", "refresh"} {
		for _, tc := range []struct {
			name, origin, media, fetch string
			duplicate                  bool
			want                       int
		}{
			{"native", "", "application/json", "", false, 401},
			{"trusted", "http://console.example", "application/json; charset=UTF-8", "cors", false, 401},
			{"canonical", "http://CONSOLE.example:80", "application/json", "cors", false, 401},
			{"hostile", "http://console.example:49179", "application/json", "cors", false, 403},
			{"null", "null", "application/json", "cors", false, 403},
			{"wildcard", "http://evil.example", "application/json", "cors", false, 403},
			{"userinfo", "http://user@console.example", "application/json", "cors", false, 403},
			{"query", "http://console.example?", "application/json", "cors", false, 403},
			{"duplicate", "http://console.example", "application/json", "cors", true, 403},
			{"missing_browser_origin", "", "application/json", "cors", false, 403},
			{"simple_body", "", "text/plain", "", false, 415},
			{"form", "", "application/x-www-form-urlencoded", "", false, 415},
			{"missing_media", "", "", "", false, 415},
		} {
			t.Run(endpoint+"/"+tc.name, func(t *testing.T) {
				h, d := loginFixture()
				r := httptest.NewRequest("POST", "/auth/"+endpoint, strings.NewReader(`{"username":"missing","password":"password"}`))
				if tc.origin != "" {
					r.Header.Set("Origin", tc.origin)
				}
				if tc.media != "" {
					r.Header.Set("Content-Type", tc.media)
				}
				if tc.fetch != "" {
					r.Header.Set("Sec-Fetch-Mode", tc.fetch)
				}
				if tc.duplicate {
					r.Header.Add("Origin", tc.origin)
				}
				w := httptest.NewRecorder()
				if endpoint == "login" {
					h.AuthLogin(w, r)
				} else {
					h.AuthRefresh(w, r)
				}
				if w.Code != tc.want {
					t.Fatalf("status=%d want=%d", w.Code, tc.want)
				}
				if w.Header().Get("Cache-Control") != "no-store" || w.Header().Get("Pragma") != "no-cache" {
					t.Fatal("cacheable auth response")
				}
				if len(w.Result().Cookies()) != 0 {
					t.Fatal("denied request wrote cookie")
				}
				if tc.want != 401 && d.calls != 0 {
					t.Fatal("denied request reached credentials store")
				}
			})
		}
	}
}
func TestSecurityUniformPasswordVerification(t *testing.T) {
	for _, name := range []string{"missing", "inactive", "wrong_password"} {
		t.Run(name, func(t *testing.T) {
			h, d := loginFixture()
			d.user.PasswordHash = "actual-user-hash"
			d.user.IsActive = name == "wrong_password"
			if name != "missing" {
				d.err = nil
			}
			calls := 0
			h.verifyPassword = func(_ string, hash string, _ config.AuthConfig) (bool, error) {
				calls++
				expected := h.dummyHash
				if name == "wrong_password" {
					expected = d.user.PasswordHash
				}
				if hash != expected {
					t.Fatal("wrong verification branch")
				}
				return false, nil
			}
			r := httptest.NewRequest("POST", "/auth/login", strings.NewReader(`{"username":"missing","password":"password"}`))
			r.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			h.AuthLogin(w, r)
			if calls != 1 || w.Code != 401 || w.Body.String() != "Invalid credentials\n" {
				t.Fatalf("calls=%d status=%d body=%q", calls, w.Code, w.Body.String())
			}
		})
	}
	h, _ := loginFixture()
	h.dummyError = errors.New("entropy unavailable")
	r := httptest.NewRequest("POST", "/auth/login", strings.NewReader(`{}`))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.AuthLogin(w, r)
	if w.Code != 503 {
		t.Fatal("initialization failure did not fail closed")
	}
}
