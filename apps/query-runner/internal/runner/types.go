package runner

import (
	"errors"
	"net/http"
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

type ErrorResponse struct {
	Error string `json:"error"`
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
	var statusErr *StatusError
	if errors.As(err, &statusErr) {
		return statusErr.StatusCode, statusErr.Message
	}
	return http.StatusInternalServerError, "Internal server error"
}
