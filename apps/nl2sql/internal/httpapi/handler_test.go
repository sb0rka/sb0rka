package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/sb0rka/sb0rka/apps/nl2sql/internal/config"
	"github.com/sb0rka/sb0rka/apps/nl2sql/internal/llm"
	"github.com/sb0rka/sb0rka/apps/nl2sql/internal/limiter"
)

func TestExtractSQL(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in, want string
	}{
		{"SELECT 1", "SELECT 1"},
		{"  SELECT 2  ", "SELECT 2"},
		{"```sql\nSELECT 3\n```", "SELECT 3"},
		{"```\nSELECT 4\n```", "SELECT 4"},
		{"", ""},
	}
	for _, tc := range cases {
		if got := extractSQL(tc.in); got != tc.want {
			t.Fatalf("extractSQL(%q) = %q want %q", tc.in, got, tc.want)
		}
	}
}

func TestHandler_HandleGenerate(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"role": "assistant", "content": "CREATE TABLE t (id int PRIMARY KEY);"}},
			},
		})
	}))
	t.Cleanup(srv.Close)

	cfg := config.Config{
		OpenAIModel:      "test-model",
		LLMTemp:          0.1,
		MaxQuestionRunes: 1000,
		MaxSchemaRunes:   1000,
	}
	h := &Handler{
		Cfg: cfg,
		LLM: &llm.Client{
			BaseURL:    srv.URL + "/v1",
			APIKey:     "x",
			HTTPClient: srv.Client(),
		},
	}

	res, err := h.HandleGenerate(context.Background(), GenerateRequest{
		Question: "make a table t with id",
		Schema:   "existing: none",
		Dialect:  "postgresql",
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.SQL != "CREATE TABLE t (id int PRIMARY KEY);" {
		t.Fatalf("sql %q", res.SQL)
	}
}

func TestHandler_ServeHTTP_validation(t *testing.T) {
	t.Parallel()

	h := &Handler{
		Cfg: config.Config{
			OpenAIModel:      "m",
			MaxRequestBytes:  256 * 1024,
			MaxQuestionRunes: 10,
			MaxSchemaRunes:   10,
		},
		LLM:     &llm.Client{},
		Limiter: limiter.New(100, 100),
	}

	req := httptest.NewRequest(http.MethodPost, "/generate", bytes.NewReader([]byte(`{"question":"","schema":""}`)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_ServeHTTP_unknownField(t *testing.T) {
	t.Parallel()

	h := &Handler{
		Cfg:     config.Config{OpenAIModel: "m", MaxRequestBytes: 256 * 1024, MaxQuestionRunes: 100, MaxSchemaRunes: 100},
		LLM:     &llm.Client{},
		Limiter: limiter.New(100, 100),
	}
	req := httptest.NewRequest(http.MethodPost, "/generate", bytes.NewReader([]byte(`{"question":"x","schema":"","extra":1}`)))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestHandler_ServeHTTP_sharedSecret(t *testing.T) {
	t.Parallel()

	h := &Handler{
		Cfg: config.Config{
			OpenAIModel:      "m",
			MaxRequestBytes:  256 * 1024,
			MaxQuestionRunes: 100,
			MaxSchemaRunes:   100,
			SharedSecret:     "s3cret",
		},
		LLM:     &llm.Client{},
		Limiter: limiter.New(100, 100),
	}
	req := httptest.NewRequest(http.MethodPost, "/generate", bytes.NewReader([]byte(`{"question":"q","schema":""}`)))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status %d", rec.Code)
	}

	req2 := httptest.NewRequest(http.MethodPost, "/generate", bytes.NewReader([]byte(`{"question":"q","schema":""}`)))
	req2.Header.Set("X-NL2SQL-Secret", "s3cret")
	rec2 := httptest.NewRecorder()
	// LLM will fail — use a mock server
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{"message": map[string]any{"content": "SELECT 1"}}},
		})
	}))
	t.Cleanup(srv.Close)
	h.LLM = &llm.Client{BaseURL: srv.URL + "/v1", APIKey: "k", HTTPClient: srv.Client()}
	h.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec2.Code, rec2.Body.String())
	}
}

func TestClientLimitKey(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Forwarded-For", "203.0.113.1, 10.0.0.1")
	if got := clientLimitKey(req); got != "xff:203.0.113.1" {
		t.Fatalf("got %q", got)
	}
}
