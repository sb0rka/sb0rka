package platform

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestDatabaseURI(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("expected GET, got %s", r.Method)
		}
		if r.URL.EscapedPath() != "/projects/project_1/resources/db_1/database/uri" {
			t.Fatalf("unexpected path %q", r.URL.EscapedPath())
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test.jwt" {
			t.Fatalf("unexpected authorization header %q", got)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("postgres://user:pass@example/db\n"))
	}))
	defer server.Close()

	client, err := NewClient(server.URL, time.Second)
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	uri, err := client.DatabaseURI(context.Background(), "test.jwt", "project_1", "db_1")
	if err != nil {
		t.Fatalf("database uri: %v", err)
	}
	if uri != "postgres://user:pass@example/db" {
		t.Fatalf("unexpected uri %q", uri)
	}
}

func TestDatabaseURIMapsPlatformStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "Database not found", http.StatusNotFound)
	}))
	defer server.Close()

	client, err := NewClient(server.URL, time.Second)
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	_, err = client.DatabaseURI(context.Background(), "test.jwt", "project_1", "db_1")
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "Database not found") {
		t.Fatalf("unexpected error %v", err)
	}
}
