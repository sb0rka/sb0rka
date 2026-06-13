package transport

import (
	"encoding/json"
	"net/http"
	"time"
)

func (s *Server) ping(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("pong"))
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	start := time.Now()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	body := map[string]any{
		"status":           "ok",
		"response_time_ms": time.Since(start).Milliseconds(),
	}
	_ = json.NewEncoder(w).Encode(body)
}
