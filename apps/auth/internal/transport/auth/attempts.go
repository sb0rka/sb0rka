package auth

import (
	"net/http"
	"strconv"
	"time"
)

func (h *Handler) allowPasswordAttempt(w http.ResponseWriter, r *http.Request, bucket string, limit int, window time.Duration) bool {
	retry, err := h.deps.Database.AuthenticationAttempt(r.Context(), bucket, limit, window)
	if err != nil {
		h.deps.Log.Error("authentication_attempt_store_unavailable")
		http.Error(w, "Authentication unavailable", http.StatusServiceUnavailable)
		return false
	}
	if retry > 0 {
		w.Header().Set("Retry-After", strconv.FormatInt(int64(retry/time.Second)+1, 10))
		http.Error(w, "Too many authentication attempts", http.StatusTooManyRequests)
		return false
	}
	return true
}
