package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/sb0rka/sb0rka/apps/nl2sql/internal/config"
	"github.com/sb0rka/sb0rka/apps/nl2sql/internal/limiter"
	"github.com/sb0rka/sb0rka/apps/nl2sql/internal/llm"
)

const defaultExplainStyle = "Explain the SQL in clear prose. Your explanation should cover these three things (weave them naturally—you do not need separate titled sections):\n\n" +
	"1. Syntax errors and other statement-level problems (invalid references, dialect mismatches, logic issues). If nothing stands out from the text alone, say so briefly.\n\n" +
	"2. Detailed breakdown of the query: explain clause by clause (SELECT list, FROM, JOINs, WHERE, GROUP BY, HAVING, ORDER BY, subqueries, window functions, aggregates), what each part means, and the logical result in plain language.\n\n" +
	"3. Data safety concerns: destructive or wide-impact writes, risky UPDATE/DELETE, DDL that drops or truncates, heavy scans or locks, injection-prone patterns if visible; for read-only queries, note any residual risks briefly if relevant."

// explainStyleNoneSentinel must match apps/console/src/features/projects/explain-styles.ts EXPLAIN_STYLE_NONE_SENTINEL.
const explainStyleNoneSentinel = "Return no text at all for the explanation: your entire reply must be empty (zero characters, no whitespace)."

var errEmptyExplanation = errors.New("empty explanation")

var errEmptyFixedSQL = errors.New("empty fixed sql")

var errInvalidFixResponse = errors.New("invalid fix response")

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
	SQL              string `json:"sql"`
	Style            string `json:"style"`
	ExplanationStyle string `json:"explanationStyle"`
	Schema           string `json:"schema"`
	Dialect          string `json:"dialect"`
}

type ExplainResponse struct {
	Explanation string `json:"explanation"`
	RawMessage  string `json:"raw_message,omitempty"`
}

type FixRequest struct {
	SQL          string `json:"sql"`
	ErrorMessage string `json:"error_message"`
	Schema       string `json:"schema"`
	Dialect      string `json:"dialect"`
}

type FixResponse struct {
	Explanation string `json:"explanation"`
	FixedSQL    string `json:"fixed_sql"`
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
	case "/generate", "/explain", "/fix":
	default:
		logRouteError(r, r.URL.Path, http.StatusNotFound, "Not found", nil)
		writeJSONError(w, http.StatusNotFound, "Not found")
		return
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		logRouteError(r, r.URL.Path, http.StatusMethodNotAllowed, "Method not allowed", nil)
		writeJSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	if h.Cfg.SharedSecret != "" {
		if !constantTimeEqual(strings.TrimSpace(r.Header.Get("X-NL2SQL-Secret")), h.Cfg.SharedSecret) {
			logRouteError(r, r.URL.Path, http.StatusUnauthorized, "Unauthorized", nil)
			writeJSONError(w, http.StatusUnauthorized, "Unauthorized")
			return
		}
	}

	limitKey := clientLimitKey(r)
	if !h.Limiter.Allow(limitKey) {
		logRouteError(r, r.URL.Path, http.StatusTooManyRequests, "Rate limit exceeded", nil)
		writeJSONError(w, http.StatusTooManyRequests, "Rate limit exceeded")
		return
	}

	switch r.URL.Path {
	case "/generate":
		h.handleGenerate(w, r)
	case "/explain":
		h.handleExplain(w, r)
	case "/fix":
		h.handleFix(w, r)
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
		logRouteError(r, "/generate", http.StatusBadGateway, "LLM request failed", err)
		writeJSONError(w, http.StatusBadGateway, "LLM request failed")
		return
	}

	sql := extractSQL(raw)
	if sql == "" {
		logRouteError(r, "/generate", http.StatusBadGateway, "Model returned no SQL", nil)
		writeJSONError(w, http.StatusBadGateway, "Model returned no SQL")
		return
	}

	explanation, _, err := h.completeExplain(ctx, sql, styleForPrompt, req.Schema, req.Dialect)
	if err != nil {
		if errors.Is(err, errEmptyExplanation) {
			logRouteError(r, "/generate", http.StatusBadGateway, "Model returned no explanation", err)
			writeJSONError(w, http.StatusBadGateway, "Model returned no explanation")
			return
		}
		logRouteError(r, "/generate", http.StatusBadGateway, "LLM request failed", err)
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
	req.ExplanationStyle = strings.TrimSpace(req.ExplanationStyle)
	if req.Style == "" {
		req.Style = req.ExplanationStyle
	}
	req.Schema = strings.TrimSpace(req.Schema)
	req.Dialect = strings.TrimSpace(req.Dialect)
	if req.SQL == "" {
		writeJSONError(w, http.StatusBadRequest, "sql is required")
		return
	}
	if utf8.RuneCountInString(req.SQL) > h.Cfg.MaxQuestionRunes {
		writeJSONError(w, http.StatusBadRequest, "sql exceeds maximum length")
		return
	}
	if utf8.RuneCountInString(req.Schema) > h.Cfg.MaxSchemaRunes {
		writeJSONError(w, http.StatusBadRequest, "schema exceeds maximum length")
		return
	}
	styleForPrompt, tooLong := explainStyleForPrompt(req.Style, h.Cfg.MaxQuestionRunes)
	if tooLong {
		writeJSONError(w, http.StatusBadRequest, "style exceeds maximum length")
		return
	}
	if req.Dialect == "" {
		req.Dialect = "postgresql"
	}

	ctx := r.Context()
	explanation, raw, err := h.completeExplain(ctx, req.SQL, styleForPrompt, req.Schema, req.Dialect)
	if err != nil {
		if errors.Is(err, errEmptyExplanation) {
			logRouteError(r, "/explain", http.StatusBadGateway, "Model returned no explanation", err)
			writeJSONError(w, http.StatusBadGateway, "Model returned no explanation")
			return
		}
		logRouteError(r, "/explain", http.StatusBadGateway, "LLM request failed", err)
		writeJSONError(w, http.StatusBadGateway, "LLM request failed")
		return
	}

	out := ExplainResponse{Explanation: explanation}
	if h.Cfg.IncludeRawMessage {
		out.RawMessage = raw
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) handleFix(w http.ResponseWriter, r *http.Request) {
	body := io.LimitReader(r.Body, h.Cfg.MaxRequestBytes)
	var req FixRequest
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
	req.ErrorMessage = strings.TrimSpace(req.ErrorMessage)
	req.Schema = strings.TrimSpace(req.Schema)
	req.Dialect = strings.TrimSpace(req.Dialect)
	if req.SQL == "" {
		writeJSONError(w, http.StatusBadRequest, "sql is required")
		return
	}
	if req.ErrorMessage == "" {
		writeJSONError(w, http.StatusBadRequest, "error_message is required")
		return
	}
	if utf8.RuneCountInString(req.SQL) > h.Cfg.MaxQuestionRunes {
		writeJSONError(w, http.StatusBadRequest, "sql exceeds maximum length")
		return
	}
	if utf8.RuneCountInString(req.ErrorMessage) > h.Cfg.MaxQuestionRunes {
		writeJSONError(w, http.StatusBadRequest, "error_message exceeds maximum length")
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
	out, raw, err := h.completeFix(ctx, req)
	if err != nil {
		switch {
		case errors.Is(err, errEmptyExplanation):
			logRouteError(r, "/fix", http.StatusBadGateway, "Model returned no explanation", err)
			writeJSONError(w, http.StatusBadGateway, "Model returned no explanation")
		case errors.Is(err, errEmptyFixedSQL):
			logRouteError(r, "/fix", http.StatusBadGateway, "Model returned no fixed SQL", err)
			writeJSONError(w, http.StatusBadGateway, "Model returned no fixed SQL")
		case errors.Is(err, errInvalidFixResponse):
			logRouteError(r, "/fix", http.StatusBadGateway, "Model returned invalid fix response", err)
			writeJSONError(w, http.StatusBadGateway, "Model returned invalid fix response")
		default:
			logRouteError(r, "/fix", http.StatusBadGateway, "LLM request failed", err)
			writeJSONError(w, http.StatusBadGateway, "LLM request failed")
		}
		return
	}
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

func schemaSnapshotSection(schema string) string {
	var b strings.Builder
	b.WriteString("Schema snapshot — listed tables and columns already exist in the target database (may be incomplete):\n")
	if schema == "" {
		b.WriteString("(none provided)\n\n")
	} else {
		b.WriteString(schema)
		b.WriteString("\n\n")
	}
	return b.String()
}

func userPrompt(schema, question string) string {
	return schemaSnapshotSection(schema) + "Request:\n" + question
}

func explainSystemPrompt() string {
	return strings.TrimSpace(
		"You are an expert database engineer. The user will supply a SQL statement and a requested explanation style.\n\n" +
			"Rules:\n" +
			"- Follow \"Explanation style\" for tone, length, and any format it explicitly requires (e.g. headings). Otherwise address each topic it mentions in natural prose; if a topic has nothing to say, note that briefly.\n" +
			"- Explain the query in natural language only. Do not output a corrected or rewritten full SQL statement unless the requested style explicitly asks for example snippets.\n" +
			"- Prefer plain text. Do not wrap the entire answer in Markdown code fences.\n" +
			"- Be accurate about what the SQL does; if something is ambiguous, say so briefly.\n" +
			"- Use the schema snapshot when present to judge whether referenced tables and columns plausibly exist, to ground types and constraints, and to flag obvious mismatches with the target database; if no snapshot was provided, say so briefly only when it matters for the explanation.",
	)
}

func explainSystemPromptNone() string {
	return strings.TrimSpace(
		"The user supplies SQL and an \"Explanation style\" that may require a completely empty assistant reply.\n\n" +
			"If the explanation style asks for zero characters and no whitespace, comply exactly: your entire message content must be empty. " +
			"Otherwise follow the style text literally.",
	)
}

func explainUserPrompt(schema, dialect, sql, style string) string {
	var b strings.Builder
	b.WriteString(schemaSnapshotSection(schema))
	b.WriteString("Target SQL dialect: ")
	b.WriteString(dialect)
	b.WriteString("\n\nSQL to explain:\n")
	b.WriteString(sql)
	b.WriteString("\n\nExplanation style:\n")
	b.WriteString(style)
	return b.String()
}

func fixSystemPrompt(dialect string) string {
	return strings.TrimSpace(
		"You are an expert database engineer. The user will supply a SQL statement that failed when executed, the error message returned by the database or client, and optional schema context.\n\n" +
			"Rules:\n" +
			"- Diagnose what went wrong using the failing SQL, the error text, and the schema snapshot when present.\n" +
			"- Propose a corrected SQL statement valid for " + dialect + " that addresses the failure.\n" +
			"- Reply with a single JSON object only. It must have exactly two keys: \"explanation\" (plain text; briefly state the root cause and what you changed) and \"fixed_sql\" (one SQL statement as a string).\n" +
			"- Escape quotes and newlines inside JSON string values per JSON rules.\n" +
			"- Do not wrap the JSON in Markdown code fences. Do not add any text before or after the JSON object.",
	)
}

func fixUserPrompt(schema, dialect, sql, errMsg string) string {
	var b strings.Builder
	b.WriteString(schemaSnapshotSection(schema))
	b.WriteString("Target SQL dialect: ")
	b.WriteString(dialect)
	b.WriteString("\n\nFailing SQL:\n")
	b.WriteString(sql)
	b.WriteString("\n\nError message:\n")
	b.WriteString(errMsg)
	return b.String()
}

// explainStyleForPrompt maps user style (already trimmed) to the string passed to explainUserPrompt(schema, dialect, sql, style).
// Empty style uses defaultExplainStyle. If non-empty style exceeds maxRunes, tooLong is true.
// The none sentinel is passed through unchanged (see explainSystemPromptNone / completeExplain).
func explainStyleForPrompt(trimmedStyle string, maxRunes int) (styleForPrompt string, tooLong bool) {
	if trimmedStyle == "" {
		return defaultExplainStyle, false
	}
	if utf8.RuneCountInString(trimmedStyle) > maxRunes {
		return "", true
	}
	return trimmedStyle, false
}

func isExplainStyleNone(styleForPrompt string) bool {
	return styleForPrompt == explainStyleNoneSentinel
}

func (h *Handler) completeExplain(ctx context.Context, sql, styleForPrompt, schema, dialect string) (explanation string, raw string, err error) {
	sys := explainSystemPrompt()
	if isExplainStyleNone(styleForPrompt) {
		sys = explainSystemPromptNone()
	}
	messages := []llm.Message{
		{Role: "system", Content: sys},
		{Role: "user", Content: explainUserPrompt(schema, dialect, sql, styleForPrompt)},
	}
	if isExplainStyleNone(styleForPrompt) {
		raw, err = h.LLM.ChatCompletionAllowEmpty(ctx, h.Cfg.OpenAIModel, h.Cfg.LLMTemp, messages)
	} else {
		raw, err = h.LLM.ChatCompletion(ctx, h.Cfg.OpenAIModel, h.Cfg.LLMTemp, messages)
	}
	if err != nil {
		return "", "", err
	}
	explanation = normalizeExplanation(raw)
	if explanation == "" {
		if isExplainStyleNone(styleForPrompt) {
			return "", raw, nil
		}
		return "", raw, errEmptyExplanation
	}
	return explanation, raw, nil
}

func (h *Handler) completeFix(ctx context.Context, req FixRequest) (out FixResponse, raw string, err error) {
	messages := []llm.Message{
		{Role: "system", Content: fixSystemPrompt(req.Dialect)},
		{Role: "user", Content: fixUserPrompt(req.Schema, req.Dialect, req.SQL, req.ErrorMessage)},
	}
	raw, err = h.LLM.ChatCompletion(ctx, h.Cfg.OpenAIModel, h.Cfg.LLMTemp, messages)
	if err != nil {
		return FixResponse{}, "", err
	}
	explanation, fixedSQL, err := parseFixJSON(raw)
	if err != nil {
		return FixResponse{}, raw, err
	}
	return FixResponse{Explanation: explanation, FixedSQL: fixedSQL}, raw, nil
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

func stripJSONMarkdownFence(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || !strings.HasPrefix(s, "```") {
		return s
	}
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
	return strings.TrimSpace(s)
}

func parseFixJSON(raw string) (explanation, fixedSQL string, err error) {
	s := stripJSONMarkdownFence(strings.TrimSpace(raw))
	if s == "" {
		return "", "", errInvalidFixResponse
	}
	var parsed struct {
		Explanation string `json:"explanation"`
		FixedSQL    string `json:"fixed_sql"`
	}
	if err := json.Unmarshal([]byte(s), &parsed); err != nil {
		return "", "", errInvalidFixResponse
	}
	explanation = normalizeExplanation(parsed.Explanation)
	fixedSQL = extractSQL(parsed.FixedSQL)
	if explanation == "" {
		return "", "", errEmptyExplanation
	}
	if fixedSQL == "" {
		return "", "", errEmptyFixedSQL
	}
	return explanation, fixedSQL, nil
}

func writeCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-NL2SQL-Secret")
}

// logRouteError records operational failures. Client validation errors (typical 400s) are omitted.
func logRouteError(r *http.Request, route string, status int, publicMsg string, cause error) {
	if status < 400 {
		return
	}
	attrs := []any{
		"method", r.Method,
		"path", r.URL.Path,
		"route", route,
		"status", status,
		"message", publicMsg,
	}
	if cause != nil {
		attrs = append(attrs, "err", cause)
	}
	switch {
	case status >= 500:
		slog.Error("nl2sql error", attrs...)
	case status == http.StatusUnauthorized || status == http.StatusTooManyRequests:
		slog.Warn("nl2sql rejected", attrs...)
	case status == http.StatusNotFound || status == http.StatusMethodNotAllowed:
		slog.Info("nl2sql request not handled", attrs...)
	default:
		// Routine client validation (4xx) — not logged.
	}
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
	explanation, _, err := h.completeExplain(ctx, sql, styleForPrompt, req.Schema, req.Dialect)
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
	req.ExplanationStyle = strings.TrimSpace(req.ExplanationStyle)
	if req.Style == "" {
		req.Style = req.ExplanationStyle
	}
	req.Schema = strings.TrimSpace(req.Schema)
	req.Dialect = strings.TrimSpace(req.Dialect)
	if req.SQL == "" {
		return ExplainResponse{}, errors.New("sql is required")
	}
	if utf8.RuneCountInString(req.SQL) > h.Cfg.MaxQuestionRunes {
		return ExplainResponse{}, errors.New("sql exceeds maximum length")
	}
	if utf8.RuneCountInString(req.Schema) > h.Cfg.MaxSchemaRunes {
		return ExplainResponse{}, errors.New("schema exceeds maximum length")
	}
	styleForPrompt, tooLong := explainStyleForPrompt(req.Style, h.Cfg.MaxQuestionRunes)
	if tooLong {
		return ExplainResponse{}, errors.New("style exceeds maximum length")
	}
	if req.Dialect == "" {
		req.Dialect = "postgresql"
	}
	explanation, raw, err := h.completeExplain(ctx, req.SQL, styleForPrompt, req.Schema, req.Dialect)
	if err != nil {
		return ExplainResponse{}, err
	}
	out := ExplainResponse{Explanation: explanation}
	if h.Cfg.IncludeRawMessage {
		out.RawMessage = raw
	}
	return out, nil
}

// HandleFix exposes core logic for tests.
func (h *Handler) HandleFix(ctx context.Context, req FixRequest) (FixResponse, error) {
	req.SQL = strings.TrimSpace(req.SQL)
	req.ErrorMessage = strings.TrimSpace(req.ErrorMessage)
	req.Schema = strings.TrimSpace(req.Schema)
	req.Dialect = strings.TrimSpace(req.Dialect)
	if req.SQL == "" {
		return FixResponse{}, errors.New("sql is required")
	}
	if req.ErrorMessage == "" {
		return FixResponse{}, errors.New("error_message is required")
	}
	if utf8.RuneCountInString(req.SQL) > h.Cfg.MaxQuestionRunes {
		return FixResponse{}, errors.New("sql exceeds maximum length")
	}
	if utf8.RuneCountInString(req.ErrorMessage) > h.Cfg.MaxQuestionRunes {
		return FixResponse{}, errors.New("error_message exceeds maximum length")
	}
	if utf8.RuneCountInString(req.Schema) > h.Cfg.MaxSchemaRunes {
		return FixResponse{}, errors.New("schema exceeds maximum length")
	}
	if req.Dialect == "" {
		req.Dialect = "postgresql"
	}
	out, raw, err := h.completeFix(ctx, req)
	if err != nil {
		return FixResponse{}, err
	}
	if h.Cfg.IncludeRawMessage {
		out.RawMessage = raw
	}
	return out, nil
}
