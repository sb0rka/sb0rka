package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestNormalizeExplanation(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in, want string
	}{
		{"Plain prose.", "Plain prose."},
		{"  trimmed  ", "trimmed"},
		{"```text\nLine one.\n```", "Line one."},
		{"```\nNo lang\n```", "No lang"},
		{"", ""},
	}
	for _, tc := range cases {
		if got := normalizeExplanation(tc.in); got != tc.want {
			t.Fatalf("normalizeExplanation(%q) = %q want %q", tc.in, got, tc.want)
		}
	}
}

func TestParseFixJSON(t *testing.T) {
	t.Parallel()
	cases := []struct {
		raw      string
		wantExp  string
		wantSQL  string
		wantErr  error
		wantFail bool
	}{
		{
			raw:     `{"explanation":"Typo in column name.","fixed_sql":"SELECT id FROM t"}`,
			wantExp: "Typo in column name.",
			wantSQL: "SELECT id FROM t",
		},
		{
			raw: "```json\n{\"explanation\":\"x\",\"fixed_sql\":\"SELECT 1\"}\n```",
			wantExp: "x",
			wantSQL: "SELECT 1",
		},
		{
			raw:     `{"explanation":"","fixed_sql":"SELECT 1"}`,
			wantFail: true,
			wantErr:  errEmptyExplanation,
		},
		{
			raw:     `{"explanation":"ok","fixed_sql":""}`,
			wantFail: true,
			wantErr:  errEmptyFixedSQL,
		},
		{
			raw:     `not json`,
			wantFail: true,
			wantErr:  errInvalidFixResponse,
		},
	}
	for _, tc := range cases {
		exp, sql, err := parseFixJSON(tc.raw)
		if tc.wantFail {
			if err == nil || !errors.Is(err, tc.wantErr) {
				t.Fatalf("parseFixJSON(%q) err=%v want %v", tc.raw, err, tc.wantErr)
			}
			continue
		}
		if err != nil {
			t.Fatalf("parseFixJSON(%q): %v", tc.raw, err)
		}
		if exp != tc.wantExp || sql != tc.wantSQL {
			t.Fatalf("parseFixJSON(%q) = (%q,%q) want (%q,%q)", tc.raw, exp, sql, tc.wantExp, tc.wantSQL)
		}
	}
}

func TestHandler_HandleFix(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		content := `{"explanation":"Undefined column foo; use bar instead.","fixed_sql":"SELECT bar FROM t"}`
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"role": "assistant", "content": content}},
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

	res, err := h.HandleFix(context.Background(), FixRequest{
		SQL:          "SELECT foo FROM t",
		ErrorMessage: `ERROR: column "foo" does not exist`,
		Schema:       "table t(bar text)",
		Dialect:      "postgresql",
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Explanation != "Undefined column foo; use bar instead." {
		t.Fatalf("explanation %q", res.Explanation)
	}
	if res.FixedSQL != "SELECT bar FROM t" {
		t.Fatalf("fixed_sql %q", res.FixedSQL)
	}
}

func TestHandler_HandleGenerate(t *testing.T) {
	t.Parallel()

	var llmCalls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		llmCalls++
		content := "CREATE TABLE t (id int PRIMARY KEY);"
		if llmCalls == 2 {
			content = "Errors\nNone apparent from the statement alone.\n\nWhat the query does\nCreates table t with an integer primary key column id.\n\nRisks for data\nDDL creates a new table; no existing data is modified until the table is used."
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"role": "assistant", "content": content}},
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
		Question:         "make a table t with id",
		Schema:           "existing: none",
		Dialect:          "postgresql",
		ExplanationStyle: "brief",
	})
	if err != nil {
		t.Fatal(err)
	}
	if llmCalls != 2 {
		t.Fatalf("expected 2 LLM calls, got %d", llmCalls)
	}
	if res.SQL != "CREATE TABLE t (id int PRIMARY KEY);" {
		t.Fatalf("sql %q", res.SQL)
	}
	wantExplain := "Errors\nNone apparent from the statement alone.\n\nWhat the query does\nCreates table t with an integer primary key column id.\n\nRisks for data\nDDL creates a new table; no existing data is modified until the table is used."
	if res.Explanation != wantExplain {
		t.Fatalf("explanation %q want %q", res.Explanation, wantExplain)
	}
}

func TestHandler_HandleGenerate_second_llm_request_contains_schema(t *testing.T) {
	t.Parallel()

	snap := "Table public.orders:\n  id int PK NOT NULL\n\n"
	var llmCalls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		llmCalls++
		b, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			t.Errorf("read body: %v", err)
		}
		if llmCalls == 2 {
			var body struct {
				Messages []struct {
					Role    string `json:"role"`
					Content string `json:"content"`
				} `json:"messages"`
			}
			if err := json.Unmarshal(b, &body); err != nil {
				t.Errorf("decode request: %v", err)
			}
			if len(body.Messages) < 2 {
				t.Errorf("expected 2 messages on explain call, got %d", len(body.Messages))
			} else {
				u := body.Messages[1].Content
				if !strings.Contains(u, snap) {
					t.Errorf("second request user message should contain schema; got %q", u)
				}
				if !strings.Contains(u, "Target SQL dialect: postgresql") {
					t.Errorf("expected dialect in user message; got %q", u)
				}
				if !strings.Contains(u, "SQL to explain:\nSELECT 1") {
					t.Errorf("expected SQL section; got %q", u)
				}
			}
		}
		content := "SELECT 1"
		if llmCalls == 2 {
			content = "Errors\nNone.\n\nWhat the query does\nReturns one.\n\nRisks for data\nRead-only."
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"role": "assistant", "content": content}},
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
		Question:         "one row",
		Schema:           snap,
		Dialect:          "postgresql",
		ExplanationStyle: "brief",
	})
	if err != nil {
		t.Fatal(err)
	}
	if llmCalls != 2 {
		t.Fatalf("expected 2 LLM calls, got %d", llmCalls)
	}
	if res.SQL != "SELECT 1" {
		t.Fatalf("sql %q", res.SQL)
	}
	if res.Explanation == "" {
		t.Fatal("expected non-empty explanation")
	}
}

func TestHandler_HandleExplain(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"role": "assistant", "content": "Errors\nNone.\n\nWhat the query does\nIt selects rows from t where id > 1.\n\nRisks for data\nRead-only; no data modification."}},
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

	res, err := h.HandleExplain(context.Background(), ExplainRequest{
		SQL:   "SELECT * FROM t WHERE id > 1",
		Style: "one sentence",
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Explanation != "Errors\nNone.\n\nWhat the query does\nIt selects rows from t where id > 1.\n\nRisks for data\nRead-only; no data modification." {
		t.Fatalf("explanation %q", res.Explanation)
	}

	res2, err := h.HandleExplain(context.Background(), ExplainRequest{SQL: "SELECT 1"})
	if err != nil {
		t.Fatal(err)
	}
	if res2.Explanation == "" {
		t.Fatal("expected default style path to return explanation")
	}
}

func TestHandler_HandleExplain_none_empty_ok(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"role": "assistant", "content": ""}},
			},
		})
	}))
	t.Cleanup(srv.Close)

	cfg := config.Config{
		OpenAIModel:      "test-model",
		LLMTemp:          0.1,
		MaxQuestionRunes: 1000,
	}
	h := &Handler{
		Cfg: cfg,
		LLM: &llm.Client{
			BaseURL:    srv.URL + "/v1",
			APIKey:     "x",
			HTTPClient: srv.Client(),
		},
	}

	res, err := h.HandleExplain(context.Background(), ExplainRequest{
		SQL:   "SELECT 1",
		Style: explainStyleNoneSentinel,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Explanation != "" {
		t.Fatalf("expected empty explanation for none style, got %q", res.Explanation)
	}
}

func TestHandler_HandleExplain_non_none_empty_still_error(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"role": "assistant", "content": ""}},
			},
		})
	}))
	t.Cleanup(srv.Close)

	h := &Handler{
		Cfg: config.Config{
			OpenAIModel:      "test-model",
			LLMTemp:          0.1,
			MaxQuestionRunes: 1000,
		},
		LLM: &llm.Client{
			BaseURL:    srv.URL + "/v1",
			APIKey:     "x",
			HTTPClient: srv.Client(),
		},
	}

	_, err := h.HandleExplain(context.Background(), ExplainRequest{
		SQL:   "SELECT 1",
		Style: "one sentence",
	})
	if err == nil {
		t.Fatal("expected error when model returns empty explanation for non-none style")
	}
}

func TestHandler_HandleGenerate_none_second_call_empty(t *testing.T) {
	t.Parallel()

	var llmCalls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		llmCalls++
		content := "SELECT 1"
		if llmCalls == 2 {
			content = ""
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"role": "assistant", "content": content}},
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
		Question:         "pick one",
		Schema:           "",
		Dialect:          "postgresql",
		ExplanationStyle: explainStyleNoneSentinel,
	})
	if err != nil {
		t.Fatal(err)
	}
	if llmCalls != 2 {
		t.Fatalf("expected 2 LLM calls, got %d", llmCalls)
	}
	if res.SQL != "SELECT 1" {
		t.Fatalf("sql %q", res.SQL)
	}
	if res.Explanation != "" {
		t.Fatalf("expected empty explanation, got %q", res.Explanation)
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

func TestHandler_ServeHTTP_explain_validation(t *testing.T) {
	t.Parallel()

	h := &Handler{
		Cfg: config.Config{
			OpenAIModel:      "m",
			MaxRequestBytes:  256 * 1024,
			MaxQuestionRunes: 10,
			MaxSchemaRunes:   100,
		},
		LLM:     &llm.Client{},
		Limiter: limiter.New(100, 100),
	}

	req := httptest.NewRequest(http.MethodPost, "/explain", bytes.NewReader([]byte(`{"sql":"","style":""}`)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_ServeHTTP_fix_validation_sql(t *testing.T) {
	t.Parallel()

	h := &Handler{
		Cfg: config.Config{
			OpenAIModel:      "m",
			MaxRequestBytes:  256 * 1024,
			MaxQuestionRunes: 10,
			MaxSchemaRunes:   100,
		},
		LLM:     &llm.Client{},
		Limiter: limiter.New(100, 100),
	}

	req := httptest.NewRequest(http.MethodPost, "/fix", bytes.NewReader([]byte(`{"sql":"","error_message":"e"}`)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_ServeHTTP_fix_validation_error_message(t *testing.T) {
	t.Parallel()

	h := &Handler{
		Cfg: config.Config{
			OpenAIModel:      "m",
			MaxRequestBytes:  256 * 1024,
			MaxQuestionRunes: 10,
			MaxSchemaRunes:   100,
		},
		LLM:     &llm.Client{},
		Limiter: limiter.New(100, 100),
	}

	req := httptest.NewRequest(http.MethodPost, "/fix", bytes.NewReader([]byte(`{"sql":"SELECT 1","error_message":""}`)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_ServeHTTP_fix_unknownField(t *testing.T) {
	t.Parallel()

	h := &Handler{
		Cfg:     config.Config{OpenAIModel: "m", MaxRequestBytes: 256 * 1024, MaxQuestionRunes: 100, MaxSchemaRunes: 100},
		LLM:     &llm.Client{},
		Limiter: limiter.New(100, 100),
	}
	req := httptest.NewRequest(http.MethodPost, "/fix", bytes.NewReader([]byte(`{"sql":"SELECT 1","error_message":"x","extra":1}`)))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestHandler_ServeHTTP_fix_trailing_json(t *testing.T) {
	t.Parallel()

	h := &Handler{
		Cfg:     config.Config{OpenAIModel: "m", MaxRequestBytes: 256 * 1024, MaxQuestionRunes: 100, MaxSchemaRunes: 100},
		LLM:     &llm.Client{},
		Limiter: limiter.New(100, 100),
	}
	req := httptest.NewRequest(http.MethodPost, "/fix", bytes.NewReader([]byte(`{"sql":"SELECT 1","error_message":"e"}{}`)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestHandler_ServeHTTP_fix_ok(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		content := `{"explanation":"Added missing semicolon is not needed; fixed identifier quoting.","fixed_sql":"SELECT \"order\" FROM items"}`
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"content": content}},
			},
		})
	}))
	t.Cleanup(srv.Close)

	h := &Handler{
		Cfg: config.Config{
			OpenAIModel:      "m",
			MaxRequestBytes:  256 * 1024,
			MaxQuestionRunes: 100,
			MaxSchemaRunes:   1000,
		},
		LLM:     &llm.Client{BaseURL: srv.URL + "/v1", APIKey: "k", HTTPClient: srv.Client()},
		Limiter: limiter.New(100, 100),
	}
	body := `{"sql":"SELECT order FROM items","error_message":"syntax error at or near order"}`
	req := httptest.NewRequest(http.MethodPost, "/fix", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var out FixResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.Explanation != "Added missing semicolon is not needed; fixed identifier quoting." {
		t.Fatalf("explanation %q", out.Explanation)
	}
	if out.FixedSQL != `SELECT "order" FROM items` {
		t.Fatalf("fixed_sql %q", out.FixedSQL)
	}
}

func TestHandler_ServeHTTP_explain_schema_exceeds_max(t *testing.T) {
	t.Parallel()

	h := &Handler{
		Cfg: config.Config{
			OpenAIModel:      "m",
			MaxRequestBytes:  256 * 1024,
			MaxQuestionRunes: 100,
			MaxSchemaRunes:   3,
		},
		LLM:     &llm.Client{},
		Limiter: limiter.New(100, 100),
	}

	body := `{"sql":"SELECT 1","style":"","schema":"abcd"}`
	req := httptest.NewRequest(http.MethodPost, "/explain", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
}

func TestHandler_ServeHTTP_explain_ok(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"content": "Errors\nNone.\n\nWhat the query does\nCounts users.\n\nRisks for data\nRead-only aggregate; scans users table."}},
			},
		})
	}))
	t.Cleanup(srv.Close)

	h := &Handler{
		Cfg: config.Config{
			OpenAIModel:      "m",
			MaxRequestBytes:  256 * 1024,
			MaxQuestionRunes: 100,
			MaxSchemaRunes:   1000,
		},
		LLM:     &llm.Client{BaseURL: srv.URL + "/v1", APIKey: "k", HTTPClient: srv.Client()},
		Limiter: limiter.New(100, 100),
	}
	req := httptest.NewRequest(http.MethodPost, "/explain", bytes.NewReader([]byte(`{"sql":"SELECT COUNT(*) FROM users"}`)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var out ExplainResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.Explanation != "Errors\nNone.\n\nWhat the query does\nCounts users.\n\nRisks for data\nRead-only aggregate; scans users table." {
		t.Fatalf("explanation %q", out.Explanation)
	}
}

func TestHandler_ServeHTTP_explain_explanation_style_alias(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"content": "styled"}},
			},
		})
	}))
	t.Cleanup(srv.Close)

	h := &Handler{
		Cfg: config.Config{
			OpenAIModel:      "m",
			MaxRequestBytes:  256 * 1024,
			MaxQuestionRunes: 100,
			MaxSchemaRunes:   1000,
		},
		LLM:     &llm.Client{BaseURL: srv.URL + "/v1", APIKey: "k", HTTPClient: srv.Client()},
		Limiter: limiter.New(100, 100),
	}
	// Same field name as /generate; must not trip DisallowUnknownFields or leave style empty.
	req := httptest.NewRequest(http.MethodPost, "/explain", bytes.NewReader([]byte(`{"sql":"SELECT 1","explanationStyle":"one sentence"}`)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var out ExplainResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.Explanation != "styled" {
		t.Fatalf("explanation %q", out.Explanation)
	}
}

func TestHandler_ServeHTTP_generate_ok(t *testing.T) {
	t.Parallel()

	var llmCalls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		llmCalls++
		content := "SELECT 1"
		if llmCalls == 2 {
			content = "Errors\nNone.\n\nWhat the query does\nReturns a single row with constant 1.\n\nRisks for data\nRead-only literal select."
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"content": content}},
			},
		})
	}))
	t.Cleanup(srv.Close)

	h := &Handler{
		Cfg: config.Config{
			OpenAIModel:      "m",
			MaxRequestBytes:  256 * 1024,
			MaxQuestionRunes: 100,
			MaxSchemaRunes:   100,
		},
		LLM:     &llm.Client{BaseURL: srv.URL + "/v1", APIKey: "k", HTTPClient: srv.Client()},
		Limiter: limiter.New(100, 100),
	}
	req := httptest.NewRequest(http.MethodPost, "/generate", bytes.NewReader([]byte(`{"question":"one","schema":"","explanationStyle":"one sentence"}`)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	if llmCalls != 2 {
		t.Fatalf("expected 2 LLM calls, got %d", llmCalls)
	}
	var out GenerateResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out.SQL != "SELECT 1" {
		t.Fatalf("sql %q", out.SQL)
	}
	if out.Explanation != "Errors\nNone.\n\nWhat the query does\nReturns a single row with constant 1.\n\nRisks for data\nRead-only literal select." {
		t.Fatalf("explanation %q", out.Explanation)
	}
}

func TestHandler_ServeHTTP_generate_explanationStyle_too_long(t *testing.T) {
	t.Parallel()

	h := &Handler{
		Cfg: config.Config{
			OpenAIModel:      "m",
			MaxRequestBytes:  256 * 1024,
			MaxQuestionRunes: 3,
			MaxSchemaRunes:   100,
		},
		LLM:     &llm.Client{},
		Limiter: limiter.New(100, 100),
	}
	req := httptest.NewRequest(http.MethodPost, "/generate", bytes.NewReader([]byte(`{"question":"hi","schema":"","explanationStyle":"aaaa"}`)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var er ErrorResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &er); err != nil {
		t.Fatal(err)
	}
	if er.Error != "explanation_style exceeds maximum length" {
		t.Fatalf("error %q", er.Error)
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
	var llmCalls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		llmCalls++
		content := "SELECT 1"
		if llmCalls == 2 {
			content = "Errors\nNone.\n\nWhat the query does\nReturns one column of integer 1.\n\nRisks for data\nRead-only literal select."
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{"message": map[string]any{"content": content}}},
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
