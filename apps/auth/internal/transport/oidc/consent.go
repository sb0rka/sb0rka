package oidc

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
	"github.com/sb0rka/sb0rka/packages/contract"
	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"
)

func isMissingGrant(err error) bool { return errors.Is(err, pgx.ErrNoRows) }

// DelegationConsent godoc
// @Summary Open Console to select projects and capabilities for a registered application
// @Description Validates the pending request and redirects to the fixed Console entrypoint. Consent UI is served entirely by Console.
// @Tags oauth2
// @Param request_id query string true "Consent request UUID"
// @Success 303 "Redirect to Console"
// @Failure 400 {object} contract.OAuthErrorResponse
// @Failure 410 {object} contract.OAuthErrorResponse
// @Failure 503 {object} contract.OAuthErrorResponse
// @Router /oauth2/delegations/consent [get]
func (h *Handler) DelegationConsent(w http.ResponseWriter, r *http.Request) {
	setNoStore(w.Header())
	w.Header().Set("Referrer-Policy", "no-referrer")
	id, ok := consentRequestID(r)
	if !ok {
		h.writeOAuthError(w, newProtocolError("invalid_request", http.StatusBadRequest))
		return
	}
	if _, err := h.database.DelegationRequest(r.Context(), id); err != nil {
		h.writeConsentStoreError(w, err)
		return
	}
	target, err := url.Parse(h.config.LoginURL)
	if err != nil {
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusServiceUnavailable))
		return
	}
	// The root document works with static Object Storage hosting without SPA rewrites.
	target.Path, target.RawPath, target.RawQuery, target.Fragment = "/", "", "", ""
	query := url.Values{}
	query.Set("consent_request_id", id.String())
	target.RawQuery = query.Encode()
	w.Header().Set("Location", target.String())
	w.WriteHeader(http.StatusSeeOther)
}

func consentRequestID(r *http.Request) (uuid.UUID, bool) {
	values := r.URL.Query()
	value, ok := singleValue(values, "request_id")
	if !ok || len(values) != 1 {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(value)
	return id, err == nil && id != uuid.Nil
}

type consentContext struct {
	request       db.DelegationRequest
	userID        uuid.UUID
	sessionID     uuid.UUID
	clientName    string
	allowedScopes []string
}

func (c consentContext) csrfPurpose() string {
	return "delegation_consent:" + c.request.ID.String() + ":" + c.sessionID.String()
}

func (h *Handler) resolveConsent(w http.ResponseWriter, r *http.Request, id uuid.UUID) (consentContext, bool) {
	pending, err := h.database.DelegationRequest(r.Context(), id)
	if err != nil {
		h.writeConsentStoreError(w, err)
		return consentContext{}, false
	}
	userRaw, userOK := authctx.RequireUserSubject(r.Context())
	sidRaw, sidOK := authctx.SessionIDFromContext(r.Context())
	user, userErr := uuid.Parse(userRaw)
	sid, sidErr := uuid.Parse(sidRaw)
	if !userOK || !sidOK || userErr != nil || sidErr != nil || user == uuid.Nil || sid == uuid.Nil {
		h.writeOAuthError(w, newProtocolError("invalid_token", http.StatusUnauthorized))
		return consentContext{}, false
	}
	if user != pending.SubjectID {
		h.writeOAuthError(w, newProtocolError("access_denied", http.StatusForbidden))
		return consentContext{}, false
	}
	registered, enabled := h.config.Registry.Client(pending.ClientID)
	allowedScopes := registered.DelegationPolicies[pending.Audience]
	if !enabled || len(allowedScopes) == 0 {
		h.writeOAuthError(w, newProtocolError("access_denied", http.StatusForbidden))
		return consentContext{}, false
	}
	return consentContext{pending, user, sid, registered.Name, allowedScopes}, true
}

func (h *Handler) writeConsentStoreError(w http.ResponseWriter, err error) {
	if errors.Is(err, db.ErrOIDCInvalidGrant) {
		h.writeOAuthError(w, newProtocolError("access_denied", http.StatusForbidden))
		return
	}
	if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, db.ErrOIDCAuthRequestNotFound) {
		h.writeOAuthError(w, newProtocolError("invalid_request", http.StatusGone))
		return
	}
	h.writeOAuthError(w, newProtocolError("temporarily_unavailable", http.StatusServiceUnavailable))
}

// DelegationConsentDetails godoc
// @Summary Read pending consent metadata for Console
// @Description Requires the initiating user's live Console session and exact Console Origin. Projects and scope identifiers are revalidated on approval; presentation belongs to Console.
// @Tags oauth2
// @Security BearerAuth
// @Produce json
// @Param Origin header string true "Configured Console origin"
// @Param request_id query string true "Consent request UUID"
// @Success 200 {object} contract.DelegationConsentResponse
// @Failure 400 {object} contract.OAuthErrorResponse
// @Failure 401 {object} contract.OAuthErrorResponse
// @Failure 403 {object} contract.OAuthErrorResponse
// @Failure 410 {object} contract.OAuthErrorResponse
// @Failure 503 {object} contract.OAuthErrorResponse
// @Router /oauth2/delegations/consent/details [get]
func (h *Handler) DelegationConsentDetails(w http.ResponseWriter, r *http.Request) {
	setNoStore(w.Header())
	w.Header().Set("Referrer-Policy", "no-referrer")
	if !h.requireConsoleOrigin(w, r) {
		return
	}
	id, ok := consentRequestID(r)
	if !ok {
		h.writeOAuthError(w, newProtocolError("invalid_request", http.StatusBadRequest))
		return
	}
	consent, ok := h.resolveConsent(w, r, id)
	if !ok {
		return
	}
	projects, err := h.consentProjects(r, consent.userID, consent.sessionID)
	if err != nil {
		h.writeConsentStoreError(w, err)
		return
	}
	csrf, err := h.credentials.seal(consent.csrfPurpose(), []byte(id.String()))
	if err != nil {
		h.writeConsentStoreError(w, err)
		return
	}
	available := make([]contract.DelegationConsentProject, 0, len(projects))
	for _, project := range projects {
		if project.IsActive {
			available = append(available, contract.DelegationConsentProject{PublicID: project.PublicID, Name: project.Name})
		}
	}
	writePlatformJSON(w, contract.DelegationConsentResponse{
		RequestID: id, ClientID: consent.request.ClientID, ClientName: consent.clientName,
		Audience: consent.request.Audience, Projects: available, Scopes: consent.allowedScopes, CSRFToken: csrf,
	})
}

func parseConsentDecision(w http.ResponseWriter, r *http.Request) (contract.DelegationConsentDecision, bool) {
	var decision contract.DelegationConsentDecision
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" || r.URL.RawQuery != "" {
		return decision, false
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxFormBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(&decision) != nil || decoder.Decode(new(any)) != io.EOF || decision.RequestID == uuid.Nil ||
		decision.CSRFToken == "" || (decision.Decision != "approve" && decision.Decision != "deny") {
		return decision, false
	}
	return decision, true
}

// DelegationConsentSubmit godoc
// @Summary Approve or deny a pending integration request from Console
// @Description Requires the initiating user's live Console session, exact Console Origin and session-bound CSRF. Callback codes are one-use and PKCE-bound.
// @Tags oauth2
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param Origin header string true "Configured Console origin"
// @Param request body contract.DelegationConsentDecision true "Consent decision"
// @Success 200 {object} contract.OIDCContinuationResponse
// @Failure 400 {object} contract.OAuthErrorResponse
// @Failure 401 {object} contract.OAuthErrorResponse
// @Failure 403 {object} contract.OAuthErrorResponse
// @Failure 410 {object} contract.OAuthErrorResponse
// @Failure 503 {object} contract.OAuthErrorResponse
// @Router /oauth2/delegations/consent [post]
func (h *Handler) DelegationConsentSubmit(w http.ResponseWriter, r *http.Request) {
	setNoStore(w.Header())
	w.Header().Set("Referrer-Policy", "no-referrer")
	if !h.requireConsoleOrigin(w, r) {
		return
	}
	decision, ok := parseConsentDecision(w, r)
	if !ok {
		h.writeOAuthError(w, newProtocolError("invalid_request", http.StatusBadRequest))
		return
	}
	consent, ok := h.resolveConsent(w, r, decision.RequestID)
	if !ok {
		return
	}
	raw, err := h.credentials.open(consent.csrfPurpose(), decision.CSRFToken)
	if err != nil || string(raw) != decision.RequestID.String() {
		h.writeOAuthError(w, newProtocolError("access_denied", http.StatusForbidden))
		return
	}
	if decision.Decision == "deny" {
		target, err := authorizationErrorRedirect(consent.request.RedirectURI, "access_denied", consent.request.State)
		if err != nil {
			h.writeConsentStoreError(w, err)
			return
		}
		if err := h.database.DenyDelegation(r.Context(), decision.RequestID, consent.userID); err != nil {
			h.writeConsentStoreError(w, err)
			return
		}
		writePlatformJSON(w, ToOIDCContinuationResponse(target))
		return
	}
	if !uniqueStrings(decision.Scopes, 16) || !uniqueStrings(decision.ProjectIDs, 100) {
		h.writeOAuthError(w, newProtocolError("invalid_request", http.StatusBadRequest))
		return
	}
	for _, scope := range decision.Scopes {
		if !slices.Contains(consent.allowedScopes, scope) {
			h.writeOAuthError(w, newProtocolError("invalid_scope", http.StatusBadRequest))
			return
		}
	}
	current, err := h.consentProjects(r, consent.userID, consent.sessionID)
	if err != nil {
		h.writeConsentStoreError(w, err)
		return
	}
	for _, id := range decision.ProjectIDs {
		allowed := slices.ContainsFunc(current, func(project contract.ProjectResponse) bool {
			return project.PublicID == id && project.IsActive
		})
		if !allowed {
			h.writeOAuthError(w, newProtocolError("access_denied", http.StatusForbidden))
			return
		}
	}
	code, hash, err := h.credentials.newAuthorizationCode()
	if err != nil {
		h.writeConsentStoreError(w, err)
		return
	}
	target, err := authorizationRedirect(consent.request.RedirectURI, code, consent.request.State)
	if err != nil {
		h.writeConsentStoreError(w, err)
		return
	}
	grant, err := h.database.ApproveDelegation(r.Context(), decision.RequestID, consent.userID, decision.Scopes, decision.ProjectIDs, hash)
	if err != nil {
		h.writeConsentStoreError(w, err)
		return
	}
	_ = h.database.AuditPlatform(r.Context(), "delegation.approve", consent.request.ClientID,
		&consent.userID, nil, nil, nil, "", grant.ID.String())
	writePlatformJSON(w, ToOIDCContinuationResponse(target))
}
