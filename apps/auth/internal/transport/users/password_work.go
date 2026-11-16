package users

import (
	"net"
	"net/http"
	"strconv"
	"time"

	coretransport "github.com/sb0rka/sb0rka/packages/core/transport"
)

func credentialPeer(r *http.Request, trusted []*net.IPNet) string {
	return coretransport.ClientPeer(r, trusted)
}

// Bound both guessing and concurrent Argon2 allocations. Forwarded headers
// are a quota key only when the immediate peer is a configured trusted proxy.
func (h *Handler) passwordWork(w http.ResponseWriter, r *http.Request, bucket string, limit int, window time.Duration) func() {
	retry, err := h.deps.Database.AuthenticationAttempt(r.Context(), bucket, limit, window)
	if err != nil {
		h.deps.Log.Error("authentication_attempt_store_unavailable")
		http.Error(w, "Authentication unavailable", http.StatusServiceUnavailable)
		return nil
	}
	if retry > 0 {
		w.Header().Set("Retry-After", strconv.FormatInt(int64(retry/time.Second)+1, 10))
		http.Error(w, "Too many authentication attempts", http.StatusTooManyRequests)
		return nil
	}
	select {
	case h.passwordSlots <- struct{}{}:
		return func() { <-h.passwordSlots }
	default:
		w.Header().Set("Retry-After", "1")
		http.Error(w, "Too many authentication attempts", http.StatusTooManyRequests)
		return nil
	}
}
