package runner

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/aws/aws-lambda-go/events"
)

const maxRequestBytes = 256 * 1024

type PlatformClient interface {
	DatabaseURI(ctx context.Context, bearer string, projectID string, databaseID string) (string, error)
}

type Executor interface {
	Query(ctx context.Context, uri string, sql string) (QueryResponse, error)
	IntrospectSchema(ctx context.Context, uri string) (SchemaResponse, error)
}

type Service struct {
	platform PlatformClient
	executor Executor
	limiter  *Limiter
}

func NewService(platform PlatformClient, executor Executor, limiter *Limiter) *Service {
	return &Service{
		platform: platform,
		executor: executor,
		limiter:  limiter,
	}
}

func (s *Service) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	writeCORSHeaders(w)

	// CORS preflight: respond without 404 so browsers don't block POST to /query or /schema.
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	path := strings.TrimSpace(r.URL.Path)
	path = strings.TrimSuffix(path, "/")
	if path == "" {
		path = "/"
	}

	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	switch path {
	case "/query":
		response, err := s.HandleQuery(r.Context(), r.Header.Get("Authorization"), r.Body)
		if err != nil {
			status, message := ErrorStatus(err)
			writeJSONError(w, status, message)
			return
		}
		writeJSON(w, http.StatusOK, response)
	case "/schema":
		response, err := s.HandleSchema(r.Context(), r.Header.Get("Authorization"), r.Body)
		if err != nil {
			status, message := ErrorStatus(err)
			writeJSONError(w, status, message)
			return
		}
		writeJSON(w, http.StatusOK, response)
	default:
		writeJSONError(w, http.StatusNotFound, "Not found")
	}
}

func (s *Service) HandleLambda(ctx context.Context, request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	path := strings.TrimSpace(request.RawPath)
	if path == "" {
		path = "/"
	}
	if path != "/query" && path != "/schema" {
		return lambdaJSONError(http.StatusNotFound, "Not found")
	}
	if request.RequestContext.HTTP.Method == http.MethodOptions {
		return events.APIGatewayV2HTTPResponse{
			StatusCode: http.StatusNoContent,
			Headers:    corsHeaders(),
		}, nil
	}
	if request.RequestContext.HTTP.Method != "" && request.RequestContext.HTTP.Method != http.MethodPost {
		return lambdaJSONError(http.StatusMethodNotAllowed, "Method not allowed")
	}

	body := request.Body
	if request.IsBase64Encoded {
		decoded, err := base64.StdEncoding.DecodeString(body)
		if err != nil {
			return lambdaJSONError(http.StatusBadRequest, "Invalid request body")
		}
		body = string(decoded)
	}

	auth := headerValue(request.Headers, "authorization")
	reader := strings.NewReader(body)

	switch path {
	case "/query":
		response, err := s.HandleQuery(ctx, auth, reader)
		if err != nil {
			status, message := ErrorStatus(err)
			return lambdaJSONError(status, message)
		}
		return lambdaJSON(http.StatusOK, response)
	case "/schema":
		response, err := s.HandleSchema(ctx, auth, reader)
		if err != nil {
			status, message := ErrorStatus(err)
			return lambdaJSONError(status, message)
		}
		return lambdaJSON(http.StatusOK, response)
	default:
		return lambdaJSONError(http.StatusNotFound, "Not found")
	}
}

func (s *Service) HandleQuery(ctx context.Context, authorization string, body io.Reader) (QueryResponse, error) {
	bearer, err := bearerToken(authorization)
	if err != nil {
		return QueryResponse{}, err
	}
	if !s.limiter.Allow(bearer) {
		return QueryResponse{}, NewStatusError(http.StatusTooManyRequests, "Rate limit exceeded", nil)
	}

	var request QueryRequest
	decoder := json.NewDecoder(io.LimitReader(body, maxRequestBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return QueryResponse{}, NewStatusError(http.StatusBadRequest, "Invalid request body", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return QueryResponse{}, NewStatusError(http.StatusBadRequest, "Invalid request body", errors.New("multiple JSON values"))
	}

	request.DatabaseID = strings.TrimSpace(request.DatabaseID)
	request.ProjectID = strings.TrimSpace(request.ProjectID)
	request.SQL = strings.TrimSpace(request.SQL)
	if request.DatabaseID == "" {
		return QueryResponse{}, NewStatusError(http.StatusBadRequest, "database_id is required", nil)
	}
	if request.ProjectID == "" {
		return QueryResponse{}, NewStatusError(http.StatusBadRequest, "project_id is required", nil)
	}
	if request.SQL == "" {
		return QueryResponse{}, NewStatusError(http.StatusBadRequest, "sql is required", nil)
	}

	uri, err := s.platform.DatabaseURI(ctx, bearer, request.ProjectID, request.DatabaseID)
	if err != nil {
		return QueryResponse{}, err
	}
	return s.executor.Query(ctx, uri, request.SQL)
}

func (s *Service) HandleSchema(ctx context.Context, authorization string, body io.Reader) (SchemaResponse, error) {
	bearer, err := bearerToken(authorization)
	if err != nil {
		return SchemaResponse{}, err
	}
	if !s.limiter.Allow(bearer) {
		return SchemaResponse{}, NewStatusError(http.StatusTooManyRequests, "Rate limit exceeded", nil)
	}

	var request SchemaRequest
	decoder := json.NewDecoder(io.LimitReader(body, maxRequestBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return SchemaResponse{}, NewStatusError(http.StatusBadRequest, "Invalid request body", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return SchemaResponse{}, NewStatusError(http.StatusBadRequest, "Invalid request body", errors.New("multiple JSON values"))
	}

	request.DatabaseID = strings.TrimSpace(request.DatabaseID)
	request.ProjectID = strings.TrimSpace(request.ProjectID)
	if request.DatabaseID == "" {
		return SchemaResponse{}, NewStatusError(http.StatusBadRequest, "database_id is required", nil)
	}
	if request.ProjectID == "" {
		return SchemaResponse{}, NewStatusError(http.StatusBadRequest, "project_id is required", nil)
	}

	uri, err := s.platform.DatabaseURI(ctx, bearer, request.ProjectID, request.DatabaseID)
	if err != nil {
		return SchemaResponse{}, err
	}
	return s.executor.IntrospectSchema(ctx, uri)
}

func bearerToken(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", NewStatusError(http.StatusUnauthorized, "Missing bearer token", nil)
	}
	prefix := "Bearer "
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

func writeJSON(w http.ResponseWriter, statusCode int, value any) {
	writeCORSHeaders(w)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(value)
}

func writeJSONError(w http.ResponseWriter, statusCode int, message string) {
	writeJSON(w, statusCode, ErrorResponse{Error: message})
}

func lambdaJSON(statusCode int, value any) (events.APIGatewayV2HTTPResponse, error) {
	payload, err := json.Marshal(value)
	if err != nil {
		return events.APIGatewayV2HTTPResponse{}, fmt.Errorf("marshal response: %w", err)
	}
	headers := corsHeaders()
	headers["Content-Type"] = "application/json"
	return events.APIGatewayV2HTTPResponse{
		StatusCode: statusCode,
		Headers:    headers,
		Body:       string(payload),
	}, nil
}

func lambdaJSONError(statusCode int, message string) (events.APIGatewayV2HTTPResponse, error) {
	return lambdaJSON(statusCode, ErrorResponse{Error: message})
}

func writeCORSHeaders(w http.ResponseWriter) {
	for key, value := range corsHeaders() {
		w.Header().Set(key, value)
	}
}

func corsHeaders() map[string]string {
	return map[string]string{
		"Access-Control-Allow-Origin":  "*",
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "Authorization, Content-Type",
	}
}
