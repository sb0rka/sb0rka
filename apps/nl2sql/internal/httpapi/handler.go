package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/sb0rka/sb0rka/apps/nl2sql/internal/config"
	"github.com/sb0rka/sb0rka/apps/nl2sql/internal/llm"
	"github.com/sb0rka/sb0rka/apps/nl2sql/internal/limiter"
)

type GenerateRequest struct {
	Question string `json:"question"`
	Schema   string `json:"schema"`
	Dialect  string `json:"dialect"`
}

type GenerateResponse struct {
	SQL        string `json:"sql"`
	RawMessage string `json:"raw_message,omitempty"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

type Handler struct {
	Cfg     config.Config
	LLM     *llm.Client
	Limiter *limiter.Limiter
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	writeCORS(w)
	if r.URL.Path != "/generate" {
		writeJSONError(w, http.StatusNotFound, "Not found")
		return
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	if h.Cfg.SharedSecret != "" {
		if !constantTimeEqual(strings.TrimSpace(r.Header.Get("X-NL2SQL-Secret")), h.Cfg.SharedSecret) {
			writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
			return
		}
	}

	limitKey := clientLimitKey(r)
	if !h.Limiter.Allow(limitKey) {
		writeJSONError(w, http.StatusTooManyRequests, "Rate limit exceeded")
		return
	}

	body := io.LimitReader(r.Body, h.Cfg.MaxRequestBytes)
	var req GenerateRequest
	dec := json.NewDecoder(body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if dec.Decode(&struct{}{}) != io.EOF {
		writeJSONError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	req.Question = strings.TrimSpace(req.Question)
	req.Schema = strings.TrimSpace(req.Schema)
	req.Dialect = strings.TrimSpace(req.Dialect)
	if req.Question == "" {
		writeJSONError(w, http.StatusBadRequest, "question is required")
		return
	}
	if utf8.RuneCountInString(req.Question) > h.Cfg.MaxQuestionRunes {
		writeJSONError(w, http.StatusBadRequest, "question exceeds maximum length")
		return
	}
	if utf8.RuneCountInString(req.Schema) > h.Cfg.MaxSchemaRunes {
		writeJSONError(w, http.StatusBadRequest, "schema exceeds maximum length")
		return
	}
	if req.Dialect == "" {
		req.Dialect = "postgresql"
	}

	ctx := r.Context()
	messages := []llm.Message{
		{Role: "system", Content: systemPrompt(req.Dialect)},
		{Role: "user", Content: userPrompt(req.Schema, req.Question)},
	}

	raw, err := h.LLM.ChatCompletion(ctx, h.Cfg.OpenAIModel, h.Cfg.LLMTemp, messages)
	if err != nil {
		writeJSONError(w, http.StatusBadGateway, "LLM request failed")
		return
	}

	sql := extractSQL(raw)
	if sql == "" {
		writeJSONError(w, http.StatusBadGateway, "Model returned no SQL")
		return
	}

	out := GenerateResponse{SQL: sql}
	if h.Cfg.IncludeRawMessage {
		out.RawMessage = raw
	}
	writeJSON(w, http.StatusOK, out)
}

func clientLimitKey(r *http.Request) string {
	if secret := strings.TrimSpace(r.Header.Get("X-NL2SQL-Secret")); secret != "" {
		return "secret:" + secret
	}
	xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For"))
	if xff != "" {
		if i := strings.IndexByte(xff, ','); i >= 0 {
			xff = strings.TrimSpace(xff[:i])
		}
		if xff != "" {
			return "xff:" + xff
		}
	}
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil && host != "" {
		return "ip:" + host
	}
	return "addr:" + r.RemoteAddr
}

func systemPrompt(dialect string) string {
	return strings.TrimSpace(
		"You are an expert database engineer. The user will describe what they want in natural language and supply a snapshot of the current database schema for context.\n\n" +
			"Rules:\n" +
			"- Generate valid " + dialect + " SQL that satisfies the request.\n" +
			"- Any statement type is allowed when appropriate: SELECT, DML (INSERT/UPDATE/DELETE), DDL (CREATE/ALTER/DROP), transactions, etc.\n" +
			"- The schema text describes what already exists. Use it to stay consistent with real table/column names and types when reading or modifying existing objects.\n" +
			"- When the user asks to create new tables/columns or extend the schema, you may introduce new identifiers and DDL even if they are not in the schema snapshot.\n" +
			"- Reply with a single SQL statement only, as plain text. Do not wrap it in JSON. Do not use Markdown code fences. Do not add explanations before or after the SQL.",
	)
}

func userPrompt(schema, question string) string {
	var b strings.Builder
	b.WriteString("Current schema context (may be incomplete):\n")
	if schema == "" {
		b.WriteString("(none provided)\n\n")
	} else {
		b.WriteString(schema)
		b.WriteString("\n\n")
	}
	b.WriteString("Request:\n")
	b.WriteString(question)
	return b.String()
}

func extractSQL(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	// Strip common markdown fences if the model ignores instructions.
	if strings.HasPrefix(s, "```") {
		s = strings.TrimPrefix(s, "```")
		s = strings.TrimSpace(s)
		if strings.HasPrefix(strings.ToLower(s), "sql") {
			if i := strings.IndexByte(s, '\n'); i >= 0 {
				s = strings.TrimSpace(s[i+1:])
			}
		}
		if i := strings.LastIndex(s, "```"); i >= 0 {
			s = strings.TrimSpace(s[:i])
		}
	}
	return strings.TrimSpace(s)
}

func writeCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-NL2SQL-Secret")
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	writeCORS(w)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, ErrorResponse{Error: msg})
}

func constantTimeEqual(a, b string) bool {
	// Avoid timing leaks on unequal lengths: hash or pad — simple approach: compare length first then byte-by-byte only if same length.
	if len(a) != len(b) {
		return false
	}
	var v byte
	for i := 0; i < len(a); i++ {
		v |= a[i] ^ b[i]
	}
	return v == 0
}

// HandleGenerate exposes core logic for tests.
func (h *Handler) HandleGenerate(ctx context.Context, req GenerateRequest) (GenerateResponse, error) {
	req.Question = strings.TrimSpace(req.Question)
	req.Schema = strings.TrimSpace(req.Schema)
	req.Dialect = strings.TrimSpace(req.Dialect)
	if req.Question == "" {
		return GenerateResponse{}, errors.New("question is required")
	}
	if utf8.RuneCountInString(req.Question) > h.Cfg.MaxQuestionRunes {
		return GenerateResponse{}, errors.New("question exceeds maximum length")
	}
	if utf8.RuneCountInString(req.Schema) > h.Cfg.MaxSchemaRunes {
		return GenerateResponse{}, errors.New("schema exceeds maximum length")
	}
	if req.Dialect == "" {
		req.Dialect = "postgresql"
	}
	messages := []llm.Message{
		{Role: "system", Content: systemPrompt(req.Dialect)},
		{Role: "user", Content: userPrompt(req.Schema, req.Question)},
	}
	raw, err := h.LLM.ChatCompletion(ctx, h.Cfg.OpenAIModel, h.Cfg.LLMTemp, messages)
	if err != nil {
		return GenerateResponse{}, err
	}
	sql := extractSQL(raw)
	if sql == "" {
		return GenerateResponse{}, errors.New("empty sql")
	}
	out := GenerateResponse{SQL: sql}
	if h.Cfg.IncludeRawMessage {
		out.RawMessage = raw
	}
	return out, nil
}
