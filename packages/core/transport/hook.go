package transport

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"
)

type hookStatusError interface {
	error
	StatusCode() int
	ClientMessage() string
}

// WriteHookError exposes only explicitly controlled 4xx errors. Every other
// error is logged and replaced with a generic 500 so internal details cannot
// leak into the response.
func WriteHookError(
	w http.ResponseWriter,
	err error,
	log *slog.Logger,
	event string,
	attrs ...any,
) {
	var statusErr hookStatusError
	if errors.As(err, &statusErr) {
		status := statusErr.StatusCode()
		message := strings.TrimSpace(statusErr.ClientMessage())
		if status >= http.StatusBadRequest &&
			status < http.StatusInternalServerError &&
			message != "" {
			http.Error(w, message, status)
			return
		}
	}

	if log == nil {
		log = slog.Default()
	}
	log.Error(event, append(attrs, "error", err)...)
	http.Error(w, "Internal server error", http.StatusInternalServerError)
}
