package runner

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakePlatform struct {
	bearer     string
	projectID  string
	databaseID string
	uri        string
	err        error
}

func (f *fakePlatform) DatabaseURI(_ context.Context, bearer string, projectID string, databaseID string) (string, error) {
	f.bearer = bearer
	f.projectID = projectID
	f.databaseID = databaseID
	return f.uri, f.err
}

type fakeExecutor struct {
	uri             string
	sql             string
	schemaURI       string
	response        QueryResponse
	schemaResponse  SchemaResponse
	err             error
	schemaErr       error
}

func (f *fakeExecutor) Query(_ context.Context, uri string, sql string) (QueryResponse, error) {
	f.uri = uri
	f.sql = sql
	return f.response, f.err
}

func (f *fakeExecutor) IntrospectSchema(_ context.Context, uri string) (SchemaResponse, error) {
	f.schemaURI = uri
	return f.schemaResponse, f.schemaErr
}

func TestServeHTTPSuccess(t *testing.T) {
	platform := &fakePlatform{uri: "postgres://user:pass@example/db"}
	executor := &fakeExecutor{
		response: QueryResponse{
			Columns:    []string{"?column?"},
			Rows:       [][]any{{float64(1)}},
			DurationMS: 12,
			RowCount:   1,
		},
	}
	service := NewService(platform, executor, NewLimiter(100, 100))

	req := httptest.NewRequest(http.MethodPost, "/query", strings.NewReader(`{"database_id":"db_1","project_id":"project_1","sql":"SELECT 1;"}`))
	req.Header.Set("Authorization", "Bearer test.jwt")
	rec := httptest.NewRecorder()

	service.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
	if platform.bearer != "test.jwt" {
		t.Fatalf("expected forwarded bearer token without scheme, got %q", platform.bearer)
	}
	if platform.projectID != "project_1" || platform.databaseID != "db_1" {
		t.Fatalf("unexpected platform IDs: project=%q database=%q", platform.projectID, platform.databaseID)
	}
	if executor.uri != platform.uri || executor.sql != "SELECT 1;" {
		t.Fatalf("unexpected executor inputs: uri=%q sql=%q", executor.uri, executor.sql)
	}

	var response QueryResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.RowCount != 1 || response.DurationMS != 12 || response.Columns[0] != "?column?" {
		t.Fatalf("unexpected response: %+v", response)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("expected CORS allow-origin header, got %q", rec.Header().Get("Access-Control-Allow-Origin"))
	}
}

func TestServeHTTPPreflight(t *testing.T) {
	service := NewService(&fakePlatform{}, &fakeExecutor{}, NewLimiter(100, 100))

	req := httptest.NewRequest(http.MethodOptions, "/query", nil)
	rec := httptest.NewRecorder()

	service.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected status %d, got %d", http.StatusNoContent, rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("expected CORS allow-origin header, got %q", rec.Header().Get("Access-Control-Allow-Origin"))
	}
	if rec.Header().Get("Access-Control-Allow-Methods") != "POST, OPTIONS" {
		t.Fatalf("expected CORS allow-methods header, got %q", rec.Header().Get("Access-Control-Allow-Methods"))
	}
	if rec.Header().Get("Access-Control-Allow-Headers") != "Authorization, Content-Type" {
		t.Fatalf("expected CORS allow-headers header, got %q", rec.Header().Get("Access-Control-Allow-Headers"))
	}

	reqSchema := httptest.NewRequest(http.MethodOptions, "/schema", nil)
	recSchema := httptest.NewRecorder()
	service.ServeHTTP(recSchema, reqSchema)
	if recSchema.Code != http.StatusNoContent {
		t.Fatalf("schema OPTIONS: expected status %d, got %d", http.StatusNoContent, recSchema.Code)
	}
}

func TestServeHTTPSchemaSuccess(t *testing.T) {
	platform := &fakePlatform{uri: "postgres://user:pass@example/db"}
	executor := &fakeExecutor{
		schemaResponse: SchemaResponse{
			Tables: []SchemaTable{
				{
					Schema: "public",
					Name:   "users",
					Columns: []SchemaColumn{
						{Name: "id", DataType: "integer", IsNullable: false, IsPK: true},
					},
				},
			},
			DurationMS: 5,
		},
	}
	service := NewService(platform, executor, NewLimiter(100, 100))

	req := httptest.NewRequest(http.MethodPost, "/schema", strings.NewReader(`{"database_id":"db_1","project_id":"project_1"}`))
	req.Header.Set("Authorization", "Bearer test.jwt")
	rec := httptest.NewRecorder()

	service.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d: %s", http.StatusOK, rec.Code, rec.Body.String())
	}
	if executor.sql != "" {
		t.Fatalf("schema request should not invoke Query, got sql %q", executor.sql)
	}
	if executor.schemaURI != platform.uri {
		t.Fatalf("unexpected schema uri: %q", executor.schemaURI)
	}

	var response SchemaResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(response.Tables) != 1 || response.Tables[0].Name != "users" {
		t.Fatalf("unexpected tables: %+v", response.Tables)
	}
}

func TestServeHTTPValidation(t *testing.T) {
	service := NewService(&fakePlatform{}, &fakeExecutor{}, NewLimiter(100, 100))

	req := httptest.NewRequest(http.MethodPost, "/query", strings.NewReader(`{"database_id":"db_1","project_id":"project_1","sql":""}`))
	req.Header.Set("Authorization", "Bearer test.jwt")
	rec := httptest.NewRecorder()

	service.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "sql is required") {
		t.Fatalf("expected sanitized validation error, got %s", rec.Body.String())
	}
}

func TestServeHTTPDoesNotExposeSensitiveDetails(t *testing.T) {
	service := NewService(
		&fakePlatform{uri: "postgres://user:secret@example/db"},
		&fakeExecutor{err: NewStatusError(http.StatusBadGateway, "Database query failed", errors.New("SELECT * FROM secrets"))},
		NewLimiter(100, 100),
	)

	req := httptest.NewRequest(http.MethodPost, "/query", strings.NewReader(`{"database_id":"db_1","project_id":"project_1","sql":"SELECT * FROM secrets"}`))
	req.Header.Set("Authorization", "Bearer sensitive.jwt")
	rec := httptest.NewRecorder()

	service.ServeHTTP(rec, req)

	body := rec.Body.String()
	if strings.Contains(body, "sensitive.jwt") || strings.Contains(body, "postgres://") || strings.Contains(body, "SELECT * FROM secrets") {
		t.Fatalf("response leaked sensitive data: %s", body)
	}
	if !strings.Contains(body, "Database query failed") {
		t.Fatalf("expected generic query error, got %s", body)
	}
}

func TestServeHTTPRateLimit(t *testing.T) {
	service := NewService(
		&fakePlatform{uri: "postgres://user:pass@example/db"},
		&fakeExecutor{response: QueryResponse{}},
		NewLimiter(0.01, 1),
	)

	body := `{"database_id":"db_1","project_id":"project_1","sql":"SELECT 1"}`
	for i, wantStatus := range []int{http.StatusOK, http.StatusTooManyRequests} {
		req := httptest.NewRequest(http.MethodPost, "/query", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer same.jwt")
		rec := httptest.NewRecorder()
		service.ServeHTTP(rec, req)
		if rec.Code != wantStatus {
			t.Fatalf("request %d: expected status %d, got %d", i, wantStatus, rec.Code)
		}
	}
}
