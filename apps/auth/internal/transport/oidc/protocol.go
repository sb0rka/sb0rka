package oidc

import (
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/url"
	"strings"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
)

var authorizeParameters = map[string]struct{}{
	"client_id": {}, "redirect_uri": {}, "response_type": {}, "scope": {},
	"state": {}, "nonce": {}, "response_mode": {}, "code_challenge": {}, "code_challenge_method": {},
}

type validatedAuthorizationRequest struct {
	ClientID      string
	RedirectURI   string
	State         string
	Nonce         string
	Scopes        string
	CodeChallenge string
}

// validateAuthorizationRequest enforces the supported client, redirect, scope, nonce, and PKCE profile before persistence.
func validateAuthorizationRequest(rawQuery string, cfg config.OIDCConfig) (validatedAuthorizationRequest, *protocolError, bool) {
	if len(rawQuery) > 8192 {
		return validatedAuthorizationRequest{}, newProtocolError("invalid_request", http.StatusBadRequest), false
	}
	values, err := url.ParseQuery(rawQuery)
	if err != nil {
		return validatedAuthorizationRequest{}, newProtocolError("invalid_request", http.StatusBadRequest), false
	}

	clientID, ok := singleValue(values, "client_id")
	if !ok || clientID != cfg.ClientID {
		return validatedAuthorizationRequest{}, newProtocolError("unauthorized_client", http.StatusBadRequest), false
	}
	redirectURI, ok := singleValue(values, "redirect_uri")
	if !ok || !exactRedirectAllowed(cfg.RedirectURIs, redirectURI) {
		return validatedAuthorizationRequest{}, newProtocolError("invalid_request", http.StatusBadRequest), false
	}

	state, stateOK := singleValue(values, "state")
	canRedirect := true
	redirectError := func(code string) (validatedAuthorizationRequest, *protocolError, bool) {
		return validatedAuthorizationRequest{RedirectURI: redirectURI, State: state}, newProtocolError(code, http.StatusBadRequest), canRedirect
	}
	if !stateOK || state == "" || len(state) > 1024 {
		state = ""
		return redirectError("invalid_request")
	}
	nonce, ok := singleValue(values, "nonce")
	if !ok || !validNonce(nonce) {
		return redirectError("invalid_request")
	}

	for name, entries := range values {
		if _, supported := authorizeParameters[name]; !supported {
			switch name {
			case "request":
				return redirectError("request_not_supported")
			case "request_uri":
				return redirectError("request_uri_not_supported")
			default:
				return redirectError("invalid_request")
			}
		}
		if len(entries) != 1 {
			return redirectError("invalid_request")
		}
	}

	responseType, ok := singleValue(values, "response_type")
	if !ok || responseType != "code" {
		return redirectError("unsupported_response_type")
	}
	responseMode, ok := optionalSingleValue(values, "response_mode")
	if !ok || (responseMode != "" && responseMode != "query") {
		return redirectError("unsupported_response_mode")
	}
	scope, ok := singleValue(values, "scope")
	if !ok || !exactScopes(scope) {
		return redirectError("invalid_scope")
	}
	challenge, ok := singleValue(values, "code_challenge")
	if !ok || !validS256Challenge(challenge) {
		return redirectError("invalid_request")
	}
	challengeMethod, ok := singleValue(values, "code_challenge_method")
	if !ok || challengeMethod != "S256" {
		return redirectError("invalid_request")
	}

	return validatedAuthorizationRequest{
		ClientID:      clientID,
		RedirectURI:   redirectURI,
		State:         state,
		Nonce:         nonce,
		Scopes:        canonicalScopes,
		CodeChallenge: challenge,
	}, nil, true
}

// exactScopes requires the complete supported scope set while allowing clients to vary its order.
func exactScopes(raw string) bool {
	fields := strings.Split(raw, " ")
	if len(fields) != 4 {
		return false
	}
	allowed := map[string]struct{}{
		"openid": {}, "profile": {}, "email": {}, "offline_access": {},
	}
	seen := make(map[string]bool, 4)
	for _, scope := range fields {
		if _, ok := allowed[scope]; !ok || seen[scope] {
			return false
		}
		seen[scope] = true
	}
	return len(seen) == len(allowed)
}

// validNonce accepts only a canonical 256-bit base64url nonce for ID-token replay binding.
func validNonce(nonce string) bool {
	if len(nonce) != 43 || strings.Contains(nonce, "=") {
		return false
	}
	decoded, err := base64.RawURLEncoding.DecodeString(nonce)
	return err == nil && len(decoded) == 32 &&
		base64.RawURLEncoding.EncodeToString(decoded) == nonce
}

// singleValue returns a required parameter only when it occurs exactly once.
func singleValue(values url.Values, name string) (string, bool) {
	entries, ok := values[name]
	return firstSingle(entries, ok)
}

// optionalSingleValue accepts an absent parameter but rejects duplicate values.
func optionalSingleValue(values url.Values, name string) (string, bool) {
	entries, ok := values[name]
	if !ok {
		return "", true
	}
	return firstSingle(entries, true)
}

// firstSingle centralizes duplicate-parameter rejection for query and form parsing.
func firstSingle(entries []string, ok bool) (string, bool) {
	if !ok || len(entries) != 1 {
		return "", false
	}
	return entries[0], true
}

// exactRedirectAllowed prevents redirect URI normalization from widening the configured allowlist.
func exactRedirectAllowed(allowed []string, candidate string) bool {
	for _, redirect := range allowed {
		if candidate == redirect {
			return true
		}
	}
	return false
}

// authorizationRedirect appends a successful code response to an already validated client redirect URI.
func authorizationRedirect(target, code, state string) (string, error) {
	u, err := url.Parse(target)
	if err != nil {
		return "", err
	}
	query := u.Query()
	query.Set("code", code)
	query.Set("state", state)
	u.RawQuery = query.Encode()
	return u.String(), nil
}

// authorizationErrorRedirect appends an OAuth error while preserving state for client correlation.
func authorizationErrorRedirect(target, code, state string) (string, error) {
	u, err := url.Parse(target)
	if err != nil {
		return "", err
	}
	query := u.Query()
	query.Del("code")
	query.Set("error", code)
	if state != "" {
		query.Set("state", state)
	}
	u.RawQuery = query.Encode()
	return u.String(), nil
}

// writeOAuthError logs the protocol error and emits a client response with only the error code.
func (h *Handler) writeOAuthError(w http.ResponseWriter, protocolErr *protocolError) {
	h.logOAuthError(protocolErr)
	status := protocolErr.Status
	if status == 0 {
		status = http.StatusBadRequest
	}
	setNoStore(w.Header())
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(ToOAuthErrorResponse(protocolErr))
}

// logOAuthError records the protocol error code for operators.
func (h *Handler) logOAuthError(protocolErr *protocolError) {
	status := protocolErr.Status
	if status == 0 {
		status = http.StatusBadRequest
	}
	logger := h.logger
	if logger == nil {
		logger = slog.Default()
	}
	logger.Info("oidc_oauth_error", "error", protocolErr.Code, "status", status)
}

// setNoStore prevents intermediaries and browsers from retaining OAuth credentials or errors.
func setNoStore(header http.Header) {
	header.Set("Cache-Control", "no-store")
	header.Set("Pragma", "no-cache")
}
