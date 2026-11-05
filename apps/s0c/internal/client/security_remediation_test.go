package client

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/sb0rka/sb0rka/packages/contract"
)

func TestSecurityNativeJSONCredentials(t *testing.T) {
	payload := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(`{"exp":%d}`, time.Now().Add(time.Hour).Unix())))
	token := "header." + payload + ".signature"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Content-Type") != "application/json" || r.Header.Get("Origin") != "" {
			t.Error("invalid native request headers")
			w.WriteHeader(415)
			return
		}
		if r.URL.Path == RouteAuthLogin {
			var req contract.AuthLoginRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Username == nil || *req.Username != "audit-user" || req.Password != "audit-password" {
				t.Error("incorrect login DTO")
				w.WriteHeader(400)
				return
			}
		}
		http.SetCookie(w, &http.Cookie{Name: "refresh", Value: "fixture-refresh", Path: "/"})
		_ = json.NewEncoder(w).Encode(map[string]string{"access_token": token})
	}))
	defer server.Close()
	c := NewClient(server.URL, "audit", WithRefreshTokenCookieName("refresh"))
	access, refresh, _, err := c.Login(t.Context(), "audit-user", "audit-password")
	if err != nil || access != token || refresh != "fixture-refresh" {
		t.Fatalf("login contract: %v", err)
	}
	if _, _, _, err = c.RefreshSession(t.Context(), refresh); err != nil {
		t.Fatalf("refresh contract: %v", err)
	}
}
