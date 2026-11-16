package oidc

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/sb0rka/sb0rka/apps/auth/internal/service"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
)

// Introspect godoc
// @Summary Check the current state of a protected resource's access token
// @Description Requires a registered confidential resource client. The caller can inspect only its configured audience. Revoked tokens return active=false; infrastructure failures return 503.
// @Tags oauth2
// @Security OAuthClientAuth
// @Accept x-www-form-urlencoded
// @Produce json
// @Param token formData string true "Access JWT"
// @Param token_type_hint formData string false "access_token"
// @Success 200 {object} coreauth.IntrospectionResponse
// @Failure 401 {object} contract.OAuthErrorResponse
// @Failure 503 {object} contract.OAuthErrorResponse
// @Router /oauth2/introspect [post]
func (h *Handler) Introspect(w http.ResponseWriter, r *http.Request) {
	setNoStore(w.Header())
	caller, err := h.authenticatedClient(r)
	if err != nil || len(caller.IntrospectionAudiences) != 1 {
		h.writeOAuthError(w, newProtocolError("invalid_client", http.StatusUnauthorized))
		return
	}
	values, problem := parseFormRequest(w, r, map[string]struct{}{"token": {}, "token_type_hint": {}})
	if problem != nil {
		h.writeOAuthError(w, problem)
		return
	}
	inactive := func() { writePlatformJSON(w, coreauth.IntrospectionResponse{Active: false}) }
	audience := caller.IntrospectionAudiences[0]
	id, err := service.VerifyAccessTokenForAudience(r.Context(), values.Get("token"), audience, h.authConfig)
	if err != nil || id.SubjectKind != coreauth.SubjectUser || !id.ExpiresAt.After(time.Now()) {
		inactive()
		return
	}
	source, registered := h.config.Registry.Client(id.ClientID)
	if !registered {
		inactive()
		return
	}
	if id.ActorSubjectID == "" && source.AccessAudience != audience {
		inactive()
		return
	}
	live, err := h.database.LiveSession(r.Context(), uuid.MustParse(id.SessionID), uuid.MustParse(id.SubjectID))
	if err != nil {
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusServiceUnavailable))
		return
	}
	if !live {
		inactive()
		return
	}
	if id.ActorSubjectID != "" {
		grant, grantErr := h.database.DelegationGrant(r.Context(), uuid.MustParse(id.SubjectID), id.ClientID, audience)
		if grantErr != nil {
			if grantErr == db.ErrOIDCInvalidGrant {
				inactive()
				return
			}
			// A revoked grant is absent from the active-grant lookup.
			if isMissingGrant(grantErr) {
				inactive()
				return
			}
			h.writeOAuthError(w, newProtocolError("server_error", http.StatusServiceUnavailable))
			return
		}
		if grant.ID.String() != id.DelegationID || grant.Version != id.DelegationVersion ||
			grant.ActorSubjectID.String() != id.ActorSubjectID {
			inactive()
			return
		}
		live, err = h.database.LiveDelegation(r.Context(), grant, strings.Fields(id.Scope), id.ProjectIDs)
		if err != nil {
			h.writeOAuthError(w, newProtocolError("server_error", http.StatusServiceUnavailable))
			return
		}
		if !live {
			inactive()
			return
		}
	}
	session, sessionErr := h.database.GetAuthSession(r.Context(), uuid.MustParse(id.SessionID))
	if sessionErr != nil {
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusServiceUnavailable))
		return
	}
	if source.Type == "confidential" && (session.OAuthClientID == nil || *session.OAuthClientID != source.ClientID) {
		inactive()
		return
	}
	writePlatformJSON(w, coreauth.IntrospectionResponse{
		SessionExpiresAt: session.ExpiresAt.Unix(),
		Active:           true, Subject: id.SubjectID, ClientID: id.ClientID, Audience: audience,
		SessionID: id.SessionID, SubjectKind: id.SubjectKind, Exp: id.ExpiresAt.Unix(),
		Actor: id.ActorSubjectID, Scope: id.Scope, DelegationID: id.DelegationID,
		DelegationVersion: id.DelegationVersion, ProjectIDs: id.ProjectIDs,
	})
}
