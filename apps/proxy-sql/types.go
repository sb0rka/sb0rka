package main

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
)

type QueryRequest struct {
	DatabaseID string `json:"database_id"`
	ProjectID  string `json:"project_id"`
	SQL        string `json:"sql"`
}

type QueryResponse struct {
	Columns    []string `json:"columns"`
	Rows       [][]any  `json:"rows"`
	DurationMS int64    `json:"duration_ms"`
	RowCount   int      `json:"row_count"`
	Truncated  bool     `json:"truncated"`
}

type ErrorResponse struct {
	Error      string `json:"error"`
	ErrorChain string `json:"error_chain,omitempty"`
}

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
	Message    string
	Err        error
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
		Message:    message,
		Err:        err,
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

func logHandlerError(path string, err error) {
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
		slog.Error("proxy_sql_request_failed", attrs...)
		return
	}
	if status >= http.StatusBadRequest {
		slog.Warn("proxy_sql_request_failed", attrs...)
		return
	}
	slog.Info("proxy_sql_request_failed", attrs...)
}
