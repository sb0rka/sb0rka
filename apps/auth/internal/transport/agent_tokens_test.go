package transport

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"
	"github.com/sb0rka/sb0rka/apps/auth/internal/service"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"
)

func TestIssueInvestigationAgentTokenMembershipMapping(t *testing.T) {
	_, privateKey, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}

	for _, test := range []struct {
		name     string
		platform int
		expected int
	}{
		{name: "viewer", platform: http.StatusOK, expected: http.StatusOK},
		{name: "editor", platform: http.StatusOK, expected: http.StatusOK},
		{name: "owner", platform: http.StatusOK, expected: http.StatusOK},
		{name: "unauthorized", platform: http.StatusUnauthorized, expected: http.StatusUnauthorized},
		{name: "forbidden", platform: http.StatusForbidden, expected: http.StatusForbidden},
		{name: "hidden project", platform: http.StatusNotFound, expected: http.StatusForbidden},
		{name: "platform unavailable", platform: http.StatusInternalServerError, expected: http.StatusServiceUnavailable},
	} {
		t.Run(test.name, func(t *testing.T) {
			platform := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "Bearer user-token" {
					t.Errorf("authorization was not forwarded")
				}
				w.WriteHeader(test.platform)
			}))
			defer platform.Close()

			server := NewServer(Dependencies{Cfg: config.ServerConfig{
				PlatformAPIBaseURL: platform.URL,
				AuthConfig: config.AuthConfig{
					AccessTokenPrivateKey: privateKey,
					AccessTokenIssuer:     "auth.test",
					AccessTokenKid:        "test-key",
				},
			}, Log: discardLogger()})
			request := httptest.NewRequest(http.MethodPost, "/auth/agent-tokens/investigation", bytes.NewBufferString(
				`{"project_id":"abcdef1234","investigation_id":"11111111-1111-1111-1111-111111111111"}`,
			))
			request.Header.Set("Authorization", "Bearer user-token")
			request = request.WithContext(authctx.WithIdentity(request.Context(), authctx.Identity{
				SubjectID: "subject", SubjectKind: "user", SessionID: "session",
			}))
			recorder := httptest.NewRecorder()

			server.issueInvestigationAgentToken(recorder, request)

			if recorder.Code != test.expected {
				t.Fatalf("status: got %d, want %d; body=%s", recorder.Code, test.expected, recorder.Body.String())
			}
			if recorder.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("missing no-store")
			}
			if test.expected == http.StatusOK {
				var response investigationAgentTokenResponse
				if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
					t.Fatal(err)
				}
				if response.AccessToken == "" || response.TokenType != "Bearer" || response.ExpiresIn != 14400 {
					t.Fatalf("unexpected response: %#v", response)
				}
			}
		})
	}
}

func TestInvestigationAgentTokenRouteRequiresLiveSession(t *testing.T) {
	_, privateKey, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	subjectID, sessionID := uuid.New(), uuid.New()
	platform := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer platform.Close()

	fake := &agentTokenDatabase{session: model.AuthSession{
		ID: sessionID, SubjectID: subjectID, SubjectKind: model.SubjectKindUser,
		ExpiresAt: time.Now().UTC().Add(time.Hour),
	}}
	cfg := config.ServerConfig{
		PlatformAPIBaseURL: platform.URL,
		CORSWhitelist:      map[string]bool{"*": true},
		AuthConfig: config.AuthConfig{
			AccessTokenPrivateKey: privateKey,
			AccessTokenTTL:        time.Minute,
			AccessTokenIssuer:     "auth.test",
			AccessTokenAudience:   "api.test",
			AccessTokenKid:        "test-key",
			AccessTokenTyp:        "access+jwt",
		},
	}
	accessToken, err := service.CreateAccessToken(subjectID, sessionID, model.SubjectKindUser, cfg.AuthConfig)
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(Dependencies{Database: fake, Cfg: cfg, Log: discardLogger()})
	handler, err := server.BuildCommonHandler()
	if err != nil {
		t.Fatal(err)
	}

	call := func() *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodPost, "/auth/agent-tokens/investigation", bytes.NewBufferString(
			`{"project_id":"abcdef1234","investigation_id":"11111111-1111-1111-1111-111111111111"}`,
		))
		request.Header.Set("Authorization", "Bearer "+accessToken)
		recorder := httptest.NewRecorder()
		(*handler).ServeHTTP(recorder, request)
		return recorder
	}

	if recorder := call(); recorder.Code != http.StatusOK {
		t.Fatalf("live session status: %d, body=%s", recorder.Code, recorder.Body.String())
	}
	now := time.Now().UTC()
	fake.session.RevokedAt = &now
	if recorder := call(); recorder.Code != http.StatusUnauthorized {
		t.Fatalf("revoked session status: %d", recorder.Code)
	}
}

type agentTokenDatabase struct {
	db.Database
	session model.AuthSession
}

func (d *agentTokenDatabase) GetAuthSession(context.Context, uuid.UUID) (model.AuthSession, error) {
	return d.session, nil
}

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}
