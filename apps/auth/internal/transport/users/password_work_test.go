package users

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
	"github.com/sb0rka/sb0rka/apps/auth/internal/transport/runtime"
)

type passwordQuotaDB struct {
	db.Database
	retry time.Duration
	err   error
}

func (d passwordQuotaDB) AuthenticationAttempt(context.Context, string, int, time.Duration) (time.Duration, error) {
	return d.retry, d.err
}

func TestPasswordWorkCapsParallelHashing(t *testing.T) {
	h := NewHandler(runtime.Dependencies{Database: passwordQuotaDB{}, Log: slog.New(slog.DiscardHandler)})
	r := httptest.NewRequest(http.MethodPost, "/identity/users", nil)
	var releases []func()
	for i := 0; i < 4; i++ {
		release := h.passwordWork(httptest.NewRecorder(), r, "fixture", 30, time.Hour)
		if release == nil {
			t.Fatal("normal work rejected")
		}
		releases = append(releases, release)
	}
	w := httptest.NewRecorder()
	if release := h.passwordWork(w, r, "fixture", 30, time.Hour); release != nil || w.Code != http.StatusTooManyRequests {
		t.Fatal("parallel hashing is not bounded")
	}
	for _, release := range releases {
		release()
	}
	if release := h.passwordWork(httptest.NewRecorder(), r, "fixture", 30, time.Hour); release == nil {
		t.Fatal("budget did not recover")
	} else {
		release()
	}
	r.Header.Set("X-Forwarded-For", "203.0.113.99")
	if credentialPeer(r) != "192.0.2.1" {
		t.Fatal("untrusted forwarded header changed quota peer")
	}
}

func TestPasswordWorkFailsClosedOnQuotaOrDatabaseFailure(t *testing.T) {
	for _, tc := range []struct {
		db     passwordQuotaDB
		status int
	}{
		{passwordQuotaDB{retry: time.Minute}, http.StatusTooManyRequests},
		{passwordQuotaDB{err: errors.New("offline")}, http.StatusServiceUnavailable},
	} {
		h := NewHandler(runtime.Dependencies{Database: tc.db, Log: slog.New(slog.DiscardHandler)})
		w := httptest.NewRecorder()
		if release := h.passwordWork(w, httptest.NewRequest("POST", "/", nil), "fixture", 10, time.Minute); release != nil || w.Code != tc.status {
			t.Fatal("credential work bypassed quota")
		}
	}
}
