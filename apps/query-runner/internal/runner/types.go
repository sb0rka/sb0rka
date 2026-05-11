package runner

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
)

type QueryRequest struct {
	DatabaseID string `json:"database_id"`
	ProjectID string `json:"project_id"`
	SQL string `json:"sql"`
}

type QueryResponse struct {
	Columns []string `json:"columns"`
	Rows [][]any `json:"rows"`
	DurationMS int64 `json:"duration_ms"`
	RowCount int `json:"row_count"`
	Truncated bool `json:"truncated"`
}

type SchemaRequest struct {
	ProjectID  string `json:"project_id"`
	DatabaseID string `json:"database_id"`
}

type SchemaColumn struct {
	Name       string `json:"name"`
	DataType   string `json:"data_type"`
	IsNullable bool   `json:"is_nullable"`
	IsPK       bool   `json:"is_pk"`
}

type SchemaTable struct {
	Schema  string         `json:"schema"`
	Name    string         `json:"name"`
	Columns []SchemaColumn `json:"columns"`
}

type SchemaResponse struct {
	Tables     []SchemaTable `json:"tables"`
	DurationMS int64         `json:"duration_ms"`
}

type ErrorResponse struct {
	Error      string `json:"error"`
	ErrorChain string `json:"error_chain,omitempty"`
}

// SQLQueryFailure wraps a StatusError from PostgreSQL query execution so JSON
// responses can include error_chain for the wrapped driver/database errors.
type SQLQueryFailure struct {
	*StatusError
}

func (e *SQLQueryFailure) Unwrap() error {
	if e == nil || e.StatusError == nil {
		return nil
	}
	return e.StatusError.Err
}

type StatusError struct {
	StatusCode int
	Message string
	Err error
}

func (e *StatusError) Error() string {
	if e.Err == nil {
		return e.Message
	}
	return e.Message + ": " + e.Err.Error()
}

func (e *StatusError) Unwrap() error {
	return e.Err
}

func NewStatusError(statusCode int, message string, err error) *StatusError {
	return &StatusError{
		StatusCode: statusCode,
		Message: message,
		Err: err,
	}
}

func ErrorStatus(err error) (int, string) {
	var sqf *SQLQueryFailure
	if errors.As(err, &sqf) && sqf.StatusError != nil {
		return sqf.StatusError.StatusCode, sqf.StatusError.Message
	}
	var statusErr *StatusError
	if errors.As(err, &statusErr) {
		return statusErr.StatusCode, statusErr.Message
	}
	return http.StatusInternalServerError, "Internal server error"
}

// joinErrorChain formats each level of errors.Unwrap for logs and, for SQLQueryFailure, JSON error_chain.
func joinErrorChain(err error) string {
	if err == nil {
		return ""
	}
	var parts []string
	for e := err; e != nil; e = errors.Unwrap(e) {
		parts = append(parts, e.Error())
	}
	return strings.Join(parts, " || ")
}

// LogHandlerError logs the public HTTP status/message plus the full wrapped error chain.
// Call from HTTP/Lambda handlers only; do not log Authorization headers or request bodies here.
func LogHandlerError(path string, err error) {
	if err == nil {
		return
	}
	status, message := ErrorStatus(err)
	attrs := []any{
		"path", path,
		"http_status", status,
		"client_message", message,
		"error_chain", joinErrorChain(err),
	}
	if status >= http.StatusInternalServerError {
		slog.Error("query_runner_request_failed", attrs...)
		return
	}
	if status >= http.StatusBadRequest {
		slog.Warn("query_runner_request_failed", attrs...)
		return
	}
	slog.Info("query_runner_request_failed", attrs...)
}
