package auth

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/sb0rka/sb0rka/packages/contract"
	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"
)

// Integrations godoc
// @Summary List the current user's integration access and active OIDC session counts
// @Description Active sessions are included only for available integrations.
// @Tags auth
// @Produce json
// @Security BearerAuth
// @Success 200 {object} contract.IntegrationsResponse
// @Failure 401 {string} string
// @Failure 403 {string} string
// @Failure 503 {string} string
// @Router /auth/integrations [get]
func (h *Handler) Integrations(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	ctx := r.Context()
	rawSubject, isUser := authctx.RequireUserSubject(ctx)
	subjectID, err := uuid.Parse(rawSubject)
	if !isUser || err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if clientID, _ := authctx.ClientIDFromContext(ctx); clientID != coreauth.ClientConsole {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	var clientIDs []string
	for _, clientID := range []string{coreauth.ClientSOMWeb, coreauth.ClientIRWeb} {
		if cfg := h.deps.Cfg.OIDC; cfg != nil && cfg.Registry.AllowsGrant(clientID, "authorization_code") {
			clientIDs = append(clientIDs, clientID)
		}
	}
	counts, err := h.deps.Database.AccessibleOIDCSessionCounts(ctx, subjectID, clientIDs, h.deps.OIDCAccessHook.Allowed)
	if err != nil {
		h.deps.Log.Error("integrations_status_failed", "error", err)
		http.Error(w, "Integration status unavailable", http.StatusServiceUnavailable)
		return
	}
	statusFor := func(clientID string) contract.IntegrationStatusResponse {
		count, available := counts[clientID]
		if !available {
			return contract.IntegrationStatusResponse{}
		}
		return contract.IntegrationStatusResponse{Available: true, ActiveSessions: &count}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(contract.IntegrationsResponse{
		SOM: statusFor(coreauth.ClientSOMWeb),
		IR:  statusFor(coreauth.ClientIRWeb),
	})
}
