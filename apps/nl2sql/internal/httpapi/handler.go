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
	"github.com/sb0rka/sb0rka/apps/nl2sql/internal/limiter"
	"github.com/sb0rka/sb0rka/apps/nl2sql/internal/llm"
)

const defaultExplainStyle = "Detailed breakdown of the query: explain clause by clause (SELECT list, FROM, JOINs, WHERE, GROUP BY, HAVING, ORDER BY, subqueries, window functions, aggregates), what each part means, and the logical result in plain language."

var errEmptyExplanation = errors.New("empty explanation")

type GenerateRequest struct {
	Question         string `json:"question"`
	Schema           string `json:"schema"`
	Dialect          string `json:"dialect"`
	ExplanationStyle string `json:"explanationStyle"`
}

type GenerateResponse struct {
	SQL         string `json:"sql"`
	Explanation string `json:"explanation"`
	RawMessage  string `json:"raw_message,omitempty"`
}

type ExplainRequest struct {
	SQL   string `json:"sql"`
	Style string `json:"style"`
}

type ExplainResponse struct {
	Explanation string `json:"explanation"`
	RawMessage  string `json:"raw_message,omitempty"`
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
	switch r.URL.Path {
	case "/generate", "/explain":
	default:
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

	switch r.URL.Path {
	case "/generate":
		h.handleGenerate(w, r)
	case "/explain":
		h.handleExplain(w, r)
	}
}

func (h *Handler) handleGenerate(w http.ResponseWriter, r *http.Request) {
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
	req.ExplanationStyle = strings.TrimSpace(req.ExplanationStyle)
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
	styleForPrompt, tooLong := explainStyleForPrompt(req.ExplanationStyle, h.Cfg.MaxQuestionRunes)
	if tooLong {
		writeJSONError(w, http.StatusBadRequest, "explanation_style exceeds maximum length")
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

	explanation, _, err := h.completeExplain(ctx, sql, styleForPrompt)
	if err != nil {
		if errors.Is(err, errEmptyExplanation) {
			writeJSONError(w, http.StatusBadGateway, "Model returned no explanation")
			return
		}
		writeJSONError(w, http.StatusBadGateway, "LLM request failed")
		return
	}

	out := GenerateResponse{SQL: sql, Explanation: explanation}
	if h.Cfg.IncludeRawMessage {
		out.RawMessage = raw
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) handleExplain(w http.ResponseWriter, r *http.Request) {
	body := io.LimitReader(r.Body, h.Cfg.MaxRequestBytes)
	var req ExplainRequest
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

	req.SQL = strings.TrimSpace(req.SQL)
	req.Style = strings.TrimSpace(req.Style)
	if req.SQL == "" {
		writeJSONError(w, http.StatusBadRequest, "sql is required")
		return
	}
	if utf8.RuneCountInString(req.SQL) > h.Cfg.MaxQuestionRunes {
		writeJSONError(w, http.StatusBadRequest, "sql exceeds maximum length")
		return
	}
	styleForPrompt, tooLong := explainStyleForPrompt(req.Style, h.Cfg.MaxQuestionRunes)
	if tooLong {
		writeJSONError(w, http.StatusBadRequest, "style exceeds maximum length")
		return
	}

	ctx := r.Context()
	explanation, raw, err := h.completeExplain(ctx, req.SQL, styleForPrompt)
	if err != nil {
		if errors.Is(err, errEmptyExplanation) {
			writeJSONError(w, http.StatusBadGateway, "Model returned no explanation")
			return
		}
		writeJSONError(w, http.StatusBadGateway, "LLM request failed")
		return
	}

	out := ExplainResponse{Explanation: explanation}
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
			"- Treat the schema snapshot as objects that already exist in the target database (for example from live introspection). Use exact table and column names and compatible types.\n" +
			"- When changing existing tables or columns that appear in the snapshot, prefer incremental DDL (e.g. ALTER TABLE ... ADD COLUMN, DROP COLUMN, ALTER COLUMN, ADD CONSTRAINT). Do not emit CREATE TABLE that redefines a whole table already listed unless the user explicitly asks for a replacement definition.\n" +
			"- CREATE TABLE and other DDL are appropriate for new tables or other objects not described in the snapshot.\n" +
			"- Reply with a single SQL statement only, as plain text. Do not wrap it in JSON. Do not use Markdown code fences. Do not add explanations before or after the SQL.",
	)
}

func userPrompt(schema, question string) string {
	var b strings.Builder
	b.WriteString("Schema snapshot — listed tables and columns already exist in the target database (may be incomplete):\n")
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

func explainSystemPrompt() string {
	return strings.TrimSpace(
		"You are an expert database engineer. The user will supply a SQL statement and a requested explanation style.\n\n" +
			"Rules:\n" +
			"- Explain the query in natural language only. Do not output a corrected or rewritten full SQL statement unless the requested style explicitly asks for example snippets.\n" +
			"- Prefer plain text. Do not wrap the entire answer in Markdown code fences.\n" +
			"- Be accurate about what the SQL does; if something is ambiguous, say so briefly.",
	)
}

func explainUserPrompt(sql, style string) string {
	var b strings.Builder
	b.WriteString("SQL to explain:\n")
	b.WriteString(sql)
	b.WriteString("\n\nExplanation style:\n")
	b.WriteString(style)
	return b.String()
}

// explainStyleForPrompt maps user style (already trimmed) to the string passed to explainUserPrompt.
// Empty style uses defaultExplainStyle. If non-empty style exceeds maxRunes, tooLong is true.
func explainStyleForPrompt(trimmedStyle string, maxRunes int) (styleForPrompt string, tooLong bool) {
	if trimmedStyle == "" {
		return defaultExplainStyle, false
	}
	if utf8.RuneCountInString(trimmedStyle) > maxRunes {
		return "", true
	}
	return trimmedStyle, false
}

func (h *Handler) completeExplain(ctx context.Context, sql, styleForPrompt string) (explanation string, raw string, err error) {
	messages := []llm.Message{
		{Role: "system", Content: explainSystemPrompt()},
		{Role: "user", Content: explainUserPrompt(sql, styleForPrompt)},
	}
	raw, err = h.LLM.ChatCompletion(ctx, h.Cfg.OpenAIModel, h.Cfg.LLMTemp, messages)
	if err != nil {
		return "", "", err
	}
	explanation = normalizeExplanation(raw)
	if explanation == "" {
		return "", raw, errEmptyExplanation
	}
	return explanation, raw, nil
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

func normalizeExplanation(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if strings.HasPrefix(s, "```") {
		s = strings.TrimPrefix(s, "```")
		s = strings.TrimSpace(s)
		if i := strings.IndexByte(s, '\n'); i >= 0 {
			first := strings.TrimSpace(strings.ToLower(s[:i]))
			if first != "" && !strings.ContainsAny(first, " \t") {
				s = strings.TrimSpace(s[i+1:])
			}
		}
		if j := strings.LastIndex(s, "```"); j >= 0 {
			s = strings.TrimSpace(s[:j])
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
	req.ExplanationStyle = strings.TrimSpace(req.ExplanationStyle)
	if req.Question == "" {
		return GenerateResponse{}, errors.New("question is required")
	}
	if utf8.RuneCountInString(req.Question) > h.Cfg.MaxQuestionRunes {
		return GenerateResponse{}, errors.New("question exceeds maximum length")
	}
	if utf8.RuneCountInString(req.Schema) > h.Cfg.MaxSchemaRunes {
		return GenerateResponse{}, errors.New("schema exceeds maximum length")
	}
	styleForPrompt, tooLong := explainStyleForPrompt(req.ExplanationStyle, h.Cfg.MaxQuestionRunes)
	if tooLong {
		return GenerateResponse{}, errors.New("explanation_style exceeds maximum length")
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
	explanation, _, err := h.completeExplain(ctx, sql, styleForPrompt)
	if err != nil {
		return GenerateResponse{}, err
	}
	out := GenerateResponse{SQL: sql, Explanation: explanation}
	if h.Cfg.IncludeRawMessage {
		out.RawMessage = raw
	}
	return out, nil
}

// HandleExplain exposes core logic for tests.
func (h *Handler) HandleExplain(ctx context.Context, req ExplainRequest) (ExplainResponse, error) {
	req.SQL = strings.TrimSpace(req.SQL)
	req.Style = strings.TrimSpace(req.Style)
	if req.SQL == "" {
		return ExplainResponse{}, errors.New("sql is required")
	}
	if utf8.RuneCountInString(req.SQL) > h.Cfg.MaxQuestionRunes {
		return ExplainResponse{}, errors.New("sql exceeds maximum length")
	}
	styleForPrompt, tooLong := explainStyleForPrompt(req.Style, h.Cfg.MaxQuestionRunes)
	if tooLong {
		return ExplainResponse{}, errors.New("style exceeds maximum length")
	}
	explanation, raw, err := h.completeExplain(ctx, req.SQL, styleForPrompt)
	if err != nil {
		return ExplainResponse{}, err
	}
	out := ExplainResponse{Explanation: explanation}
	if h.Cfg.IncludeRawMessage {
		out.RawMessage = raw
	}
	return out, nil
}
