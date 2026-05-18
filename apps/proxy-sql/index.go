package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"
)

const maxRequestBytes = 256 * 1024

// Request is the HTTP event passed into the cloud function.
type Request struct {
	Method          string            `json:"method"`
	Path            string            `json:"path"`
	Headers         map[string]string `json:"headers"`
	Body            string            `json:"body"`
	IsBase64Encoded bool              `json:"isBase64Encoded"`
}

// Response is returned from the cloud function.
type Response struct {
	StatusCode int               `json:"statusCode"`
	Headers    map[string]string `json:"headers,omitempty"`
	Body       string            `json:"body"`
}

type databaseURIResolver interface {
	DatabaseURI(ctx context.Context, bearer string, projectID string, databaseID string) (string, error)
}

type queryRunner interface {
	Query(ctx context.Context, uri string, sql string) (QueryResponse, error)
}

type appRuntime struct {
	platform databaseURIResolver
	executor queryRunner
}

var (
	initOnce sync.Once
	initErr  error
	app      *appRuntime
)

func initRuntime() *appRuntime {
	initOnce.Do(func() {
		loaded, err := LoadConfig()
		if err != nil {
			initErr = err
			return
		}
		platformClient, err := NewPlatformClient(loaded.APIEndpoint, loaded.PlatformTimeout)
		if err != nil {
			initErr = err
			return
		}
		app = &appRuntime{
			platform: platformClient,
			executor: &Executor{
				ConnectTimeout:        loaded.ConnectTimeout,
				QueryTimeout:          loaded.QueryTimeout,
				MaxRows:               loaded.MaxRows,
				MaxResponseBytes:      loaded.MaxResponseBytes,
				DangerAllowAllQueries: loaded.DangerAllowAllQueries,
			},
		}
		if loaded.DangerAllowAllQueries {
			slog.Warn("proxy_sql_danger_allow_all_queries", "enabled", true)
		}
	})
	return app
}

// Handler is the cloud function entrypoint (index.Handler).
func Handler(ctx context.Context, request Request) (*Response, error) {
	rt := initRuntime()
	if initErr != nil || rt == nil {
		return jsonError(http.StatusInternalServerError, "Service misconfigured"), nil
	}
	return routeRequest(ctx, request, rt), nil
}

func routeRequest(ctx context.Context, request Request, rt *appRuntime) *Response {
	path := normalizePath(request.Path)
	method := strings.ToUpper(strings.TrimSpace(request.Method))

	if method == http.MethodOptions {
		return &Response{
			StatusCode: http.StatusNoContent,
			Headers:    corsHeaders(),
		}
	}

	if method != http.MethodPost {
		return jsonError(http.StatusMethodNotAllowed, "Method not allowed")
	}

	switch path {
	case "/query":
		return handleQuery(ctx, request, rt.platform, rt.executor)
	default:
		return jsonError(http.StatusNotFound, "Not found")
	}
}

func handleQuery(ctx context.Context, request Request, platform databaseURIResolver, executor queryRunner) *Response {
	auth := headerValue(request.Headers, "authorization")
	bearer, err := bearerToken(auth)
	if err != nil {
		logHandlerError("/query", err)
		return handlerErrorResponse(err)
	}

	body, err := requestBody(request)
	if err != nil {
		logHandlerError("/query", err)
		return handlerErrorResponse(err)
	}

	var req QueryRequest
	decoder := json.NewDecoder(io.LimitReader(strings.NewReader(body), maxRequestBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		err = NewStatusError(http.StatusBadRequest, "Invalid request body", err)
		logHandlerError("/query", err)
		return handlerErrorResponse(err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		err = NewStatusError(http.StatusBadRequest, "Invalid request body", errors.New("multiple JSON values"))
		logHandlerError("/query", err)
		return handlerErrorResponse(err)
	}

	req.DatabaseID = strings.TrimSpace(req.DatabaseID)
	req.ProjectID = strings.TrimSpace(req.ProjectID)
	req.SQL = strings.TrimSpace(req.SQL)
	if req.DatabaseID == "" {
		err = NewStatusError(http.StatusBadRequest, "database_id is required", nil)
		logHandlerError("/query", err)
		return handlerErrorResponse(err)
	}
	if req.ProjectID == "" {
		err = NewStatusError(http.StatusBadRequest, "project_id is required", nil)
		logHandlerError("/query", err)
		return handlerErrorResponse(err)
	}
	if req.SQL == "" {
		err = NewStatusError(http.StatusBadRequest, "sql is required", nil)
		logHandlerError("/query", err)
		return handlerErrorResponse(err)
	}

	uri, err := platform.DatabaseURI(ctx, bearer, req.ProjectID, req.DatabaseID)
	if err != nil {
		logHandlerError("/query", err)
		return handlerErrorResponse(err)
	}

	response, err := executor.Query(ctx, uri, req.SQL)
	if err != nil {
		logHandlerError("/query", err)
		return handlerErrorResponse(err)
	}

	slog.Info("proxy_sql_query_succeeded",
		"path", "/query",
		"project_id", req.ProjectID,
		"database_id", req.DatabaseID,
		"duration_ms", response.DurationMS,
		"row_count", response.RowCount,
		"truncated", response.Truncated,
	)

	return jsonOK(response)
}

func requestBody(request Request) (string, error) {
	body := request.Body
	if request.IsBase64Encoded {
		if base64.StdEncoding.DecodedLen(len(body)) > maxRequestBytes {
			return "", NewStatusError(http.StatusRequestEntityTooLarge, "Request body too large", nil)
		}
		decoded, err := base64.StdEncoding.DecodeString(body)
		if err != nil {
			return "", NewStatusError(http.StatusBadRequest, "Invalid request body", err)
		}
		if len(decoded) > maxRequestBytes {
			return "", NewStatusError(http.StatusRequestEntityTooLarge, "Request body too large", nil)
		}
		body = string(decoded)
	}
	if len(body) > maxRequestBytes {
		return "", NewStatusError(http.StatusRequestEntityTooLarge, "Request body too large", nil)
	}
	return body, nil
}

func bearerToken(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", NewStatusError(http.StatusUnauthorized, "Missing bearer token", nil)
	}
	const prefix = "Bearer "
	if len(value) <= len(prefix) || !strings.EqualFold(value[:len(prefix)], prefix) {
		return "", NewStatusError(http.StatusUnauthorized, "Missing bearer token", nil)
	}
	token := strings.TrimSpace(value[len(prefix):])
	if token == "" {
		return "", NewStatusError(http.StatusUnauthorized, "Missing bearer token", nil)
	}
	return token, nil
}

func headerValue(headers map[string]string, key string) string {
	for name, value := range headers {
		if strings.EqualFold(name, key) {
			return value
		}
	}
	return ""
}

func normalizePath(path string) string {
	path = strings.TrimSpace(path)
	path = strings.TrimSuffix(path, "/")
	if path == "" {
		return "/"
	}
	return path
}

func corsHeaders() map[string]string {
	return map[string]string{
		"Access-Control-Allow-Origin":  "*",
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "Authorization, Content-Type",
	}
}

func jsonOK(value any) *Response {
	payload, err := json.Marshal(value)
	if err != nil {
		return jsonError(http.StatusInternalServerError, "Internal server error")
	}
	headers := corsHeaders()
	headers["Content-Type"] = "application/json"
	return &Response{
		StatusCode: http.StatusOK,
		Headers:    headers,
		Body:       string(payload),
	}
}

func jsonError(statusCode int, message string) *Response {
	headers := corsHeaders()
	headers["Content-Type"] = "application/json"
	payload, _ := json.Marshal(ErrorResponse{Error: message})
	return &Response{
		StatusCode: statusCode,
		Headers:    headers,
		Body:       string(payload),
	}
}

func handlerErrorResponse(err error) *Response {
	status, message := ErrorStatus(err)
	resp := ErrorResponse{Error: message}
	var sqf *SQLQueryFailure
	if errors.As(err, &sqf) {
		resp.ErrorChain = joinErrorChain(err)
	}
	headers := corsHeaders()
	headers["Content-Type"] = "application/json"
	payload, _ := json.Marshal(resp)
	return &Response{
		StatusCode: status,
		Headers:    headers,
		Body:       string(payload),
	}
}

func init() {
	opts := &slog.HandlerOptions{Level: slog.LevelInfo}
	if os.Getenv("K_SERVICE") != "" || os.Getenv("FUNCTION_NAME") != "" {
		slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, opts)))
		return
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, opts)))
}
