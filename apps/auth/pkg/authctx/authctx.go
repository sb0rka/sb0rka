package authctx

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/apps/auth/internal/transport/runtime"
)

// ExtractCallerID mirrors the public extractCallerID for modules that can't import the internal runtime package.
func ExtractCallerID(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	raw, ok := runtime.AuthUserIDFromContext(r.Context())
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":"forbidden"}`))
		return uuid.UUID{}, false
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return uuid.UUID{}, false
	}
	return id, true
}
