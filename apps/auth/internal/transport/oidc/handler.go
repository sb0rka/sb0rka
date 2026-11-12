package oidc

import (
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"
	"github.com/sb0rka/sb0rka/apps/auth/internal/service"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
	"github.com/sb0rka/sb0rka/packages/contract"
	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"
)

const maxFormBytes = 8192

type Handler struct {
	config      config.OIDCConfig
	database    db.Database
	authConfig  config.AuthConfig
	credentials *credentialProtector
	tokens      *tokenIssuer
	logger      *slog.Logger
	now         func() time.Time
}

// NewHandler snapshots validated configuration and assembles the OIDC protocol dependencies.
func NewHandler(
	database db.Database,
	authConfig config.AuthConfig,
	cfg config.OIDCConfig,
	logger *slog.Logger,
) *Handler {
	cfg = cfg.Clone()
	return &Handler{
		config:      cfg,
		database:    database,
		authConfig:  authConfig,
		credentials: newCredentialProtector(cfg),
		tokens:      newTokenIssuer(cfg, authConfig),
		logger:      logger,
		now:         time.Now,
	}
}

// Discovery publishes provider capabilities and endpoint locations for OIDC clients.
// @Summary Discover the platform issuer and OIDC endpoints
// @Tags oauth2
// @Produce json
// @Success 200 {object} contract.OIDCDiscoveryResponse
// @Router /.well-known/openid-configuration [get]
func (h *Handler) Discovery(w http.ResponseWriter, _ *http.Request) {
	setNoStore(w.Header())
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_ = json.NewEncoder(w).Encode(ToOIDCDiscoveryResponse(h.config.Issuer))
}

// JWKS publishes the public signing keys for the separate access and ID-token profiles.
// @Summary Read access JWT and OIDC ID-token public keys
// @Tags oauth2
// @Produce json
// @Success 200 {object} contract.OIDCJWKSResponse
// @Router /oauth2/jwks [get]
func (h *Handler) JWKS(w http.ResponseWriter, _ *http.Request) {
	setNoStore(w.Header())
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	doc := ToOIDCJWKSResponse(&h.config.SigningPrivateKey.PublicKey, h.config.SigningKeyID)
	doc.Keys = append(
		doc.Keys,
		contract.OIDCJWKResponse{
			KTY: "OKP",
			CRV: "Ed25519",
			Alg: "EdDSA",
			Use: "sig",
			KID: h.authConfig.AccessTokenKid,
			X:   base64.RawURLEncoding.EncodeToString(h.authConfig.AccessTokenPrivateKey.Public().(ed25519.PublicKey)),
		},
	)
	if len(h.config.PreviousAccessJWKS) > 0 {
		var previous contract.OIDCJWKSResponse
		if json.Unmarshal(h.config.PreviousAccessJWKS, &previous) != nil {
			http.Error(w, "invalid previous keys", http.StatusInternalServerError)
			return
		}
		for _, key := range previous.Keys {
			if key.KTY == "OKP" && key.CRV == "Ed25519" && key.Alg == "EdDSA" && key.Use == "sig" &&
				key.KID != h.authConfig.AccessTokenKid {
				doc.Keys = append(doc.Keys, key)
			}
		}
	}
	_ = json.NewEncoder(w).Encode(doc)
}

// Authorize validates and stores a browser authorization request, then continues or starts user login.
// @Summary Start OIDC login for a registered client
// @Description Redirect URI and scopes must match the client registry. Access audience is fixed by the client profile; login creates no integration grants.
// @Tags oauth2
// @Param client_id query string true "Registered login client"
// @Param response_type query string true "code"
// @Param redirect_uri query string true "Exact registered callback URI"
// @Param scope query string true "Allowed OIDC scopes including openid"
// @Param state query string true "Client request binding"
// @Param nonce query string true "ID-token replay protection"
// @Param code_challenge query string true "PKCE S256 challenge"
// @Param code_challenge_method query string true "S256"
// @Success 303 "Redirect to login or the registered callback"
// @Failure 400 {object} contract.OAuthErrorResponse
// @Failure 503 {string} string
// @Router /oauth2/authorize [get]
func (h *Handler) Authorize(w http.ResponseWriter, r *http.Request) {
	client, exists := h.config.Registry.Client(r.URL.Query().Get("client_id"))
	if !exists || !h.clientGrantAllowed(client.ClientID, "authorization_code") {
		h.writeOAuthError(w, newProtocolError("unauthorized_client", http.StatusBadRequest))
		return
	}
	request, protocolErr, canRedirect := validateAuthorizationRequest(r.URL.RawQuery, client)
	if protocolErr != nil {
		h.audit("authorize", "rejected", protocolErr.Code)
		if canRedirect {
			target, err := authorizationErrorRedirect(request.RedirectURI, protocolErr.Code, request.State)
			if err == nil {
				setNoStore(w.Header())
				http.Redirect(w, r, target, http.StatusSeeOther)
				return
			}
		}
		h.writeOAuthError(w, protocolErr)
		return
	}

	requestID, err := uuid.NewRandom()
	if err != nil {
		h.audit("authorize", "error", "random_source")
		h.redirectAuthorizationError(w, r, request, "server_error")
		return
	}
	opaqueID, err := h.credentials.sealAuthRequestID(requestID)
	if err != nil {
		h.audit("authorize", "error", "credential_protection")
		h.redirectAuthorizationError(w, r, request, "server_error")
		return
	}
	now := h.now().UTC()
	if err := h.database.CreateOIDCPending(r.Context(), db.OIDCPendingRequest{
		ID:            requestID,
		ClientID:      request.ClientID,
		RedirectURI:   request.RedirectURI,
		State:         request.State,
		Nonce:         request.Nonce,
		Scopes:        request.Scopes,
		CodeChallenge: request.CodeChallenge,
		CreatedAt:     now,
		ExpiresAt:     now.Add(pendingRequestTTL),
	}); err != nil {
		h.audit("authorize", "error", "store")
		h.redirectAuthorizationError(w, r, request, "server_error")
		return
	}

	if _, authenticated := authctx.RequireUserSubject(r.Context()); authenticated {
		target, protocolErr := h.completeAuthorization(r, opaqueID)
		if protocolErr != nil {
			h.audit("authorize", "error", protocolErr.Code)
			h.redirectAuthorizationError(w, r, request, protocolErr.Code)
			return
		}
		setNoStore(w.Header())
		w.Header().Set("Referrer-Policy", "no-referrer")
		h.audit("authorize", "success", "none")
		http.Redirect(w, r, target, http.StatusSeeOther)
		return
	}

	loginURL, err := h.consoleLoginURL(opaqueID)
	if err != nil {
		h.audit("authorize", "error", "login_redirect")
		h.redirectAuthorizationError(w, r, request, "server_error")
		return
	}
	setNoStore(w.Header())
	w.Header().Set("Referrer-Policy", "no-referrer")
	h.audit("authorize", "success", "none")
	http.Redirect(w, r, loginURL, http.StatusSeeOther)
}

// ContinueBrowser resumes an authorization request after browser login and redirects back to the client.
// @Summary Resume a client-bound browser authorization request
// @Tags oauth2
// @Param auth_request_id query string true "Opaque authorization request identifier"
// @Success 303 "Redirect to login or the registered callback"
// @Failure 400 {object} contract.OAuthErrorResponse
// @Failure 503 {string} string
// @Router /oauth2/login/continue [get]
func (h *Handler) ContinueBrowser(w http.ResponseWriter, r *http.Request) {
	opaqueID, protocolErr := parseContinuationQuery(r.URL.Query())
	if protocolErr != nil {
		h.audit("continuation", "rejected", protocolErr.Code)
		h.writeOAuthError(w, protocolErr)
		return
	}

	if _, authenticated := authctx.RequireUserSubject(r.Context()); !authenticated {
		loginURL, err := h.consoleLoginURL(opaqueID)
		if err != nil {
			h.audit("continuation", "error", "login_redirect")
			h.writeOAuthError(w, newProtocolError("server_error", http.StatusInternalServerError))
			return
		}
		setNoStore(w.Header())
		w.Header().Set("Referrer-Policy", "no-referrer")
		http.Redirect(w, r, loginURL, http.StatusSeeOther)
		return
	}

	target, protocolErr := h.completeAuthorization(r, opaqueID)
	if protocolErr != nil {
		h.audit("continuation", "rejected", protocolErr.Code)
		h.writeOAuthError(w, protocolErr)
		return
	}
	setNoStore(w.Header())
	w.Header().Set("Referrer-Policy", "no-referrer")
	h.audit("continuation", "success", "none")
	http.Redirect(w, r, target, http.StatusSeeOther)
}

// ContinueConsole lets the trusted console resume authorization through a same-origin JSON request.
// @Summary Complete browser authorization after Console login
// @Description Requires the live Auth browser session and the configured Console Origin.
// @Tags oauth2
// @Accept json
// @Produce json
// @Param Origin header string true "Configured Console origin"
// @Param request body object{auth_request_id=string} true "Opaque authorization request identifier"
// @Success 200 {object} contract.OIDCContinuationResponse
// @Failure 400 {object} contract.OAuthErrorResponse
// @Failure 401 {object} contract.OAuthErrorResponse
// @Failure 403 {object} contract.OAuthErrorResponse
// @Failure 503 {string} string
// @Router /oauth2/login/continue [post]
func (h *Handler) ContinueConsole(w http.ResponseWriter, r *http.Request) {
	if !h.requireConsoleOrigin(w, r) {
		h.audit("continuation", "rejected", "origin")
		return
	}
	opaqueID, protocolErr := parseContinuationJSON(w, r)
	if protocolErr != nil {
		h.audit("continuation", "rejected", protocolErr.Code)
		h.writeOAuthError(w, protocolErr)
		return
	}

	target, protocolErr := h.completeAuthorization(r, opaqueID)
	if protocolErr != nil {
		h.audit("continuation", "rejected", protocolErr.Code)
		h.writeOAuthError(w, protocolErr)
		return
	}

	setNoStore(w.Header())
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	h.audit("continuation", "success", "none")
	_ = json.NewEncoder(w).Encode(ToOIDCContinuationResponse(target))
}

// completeAuthorization binds a verified user to a pending request and creates its one-time code redirect.
func (h *Handler) completeAuthorization(r *http.Request, opaqueID string) (string, *protocolError) {
	requestID, err := h.credentials.openAuthRequestID(opaqueID)
	if err != nil {
		return "", newProtocolError("invalid_request", http.StatusBadRequest)
	}
	userIDRaw, ok := authctx.RequireUserSubject(r.Context())
	if !ok {
		return "", newProtocolError("invalid_token", http.StatusUnauthorized)
	}
	userID, err := uuid.Parse(userIDRaw)
	if err != nil {
		return "", newProtocolError("server_error", http.StatusInternalServerError)
	}

	if delegation, err := h.database.DelegationRequest(r.Context(), requestID); err == nil {
		if delegation.SubjectID != userID {
			return "", newProtocolError("access_denied", http.StatusForbidden)
		}
		return h.config.Issuer + "/oauth2/delegations/consent?request_id=" + requestID.String(), nil
	}
	sourceRaw, sourceOK := authctx.SessionIDFromContext(r.Context())
	sourceSessionID, sourceErr := uuid.Parse(sourceRaw)
	if !sourceOK || sourceErr != nil {
		return "", newProtocolError("invalid_token", http.StatusUnauthorized)
	}
	authTime, ok := authctx.AuthenticationTimeFromContext(r.Context())
	if !ok || authTime.IsZero() {
		sessionIDRaw, sessionOK := authctx.SessionIDFromContext(r.Context())
		sessionID, parseErr := uuid.Parse(sessionIDRaw)
		if !sessionOK || parseErr != nil {
			return "", newProtocolError("server_error", http.StatusInternalServerError)
		}
		authTime, err = h.database.GetOIDCSessionAuthenticationTime(r.Context(), sessionID, userID)
		if err != nil {
			if errors.Is(err, db.ErrOIDCAuthSessionNotFound) {
				return "", newProtocolError("invalid_token", http.StatusUnauthorized)
			}
			return "", newProtocolError("server_error", http.StatusInternalServerError)
		}
	}

	user, err := h.database.GetOIDCActiveUser(r.Context(), userID)
	if err != nil {
		if errors.Is(err, db.ErrOIDCInactiveUser) {
			return h.rejectAuthorization(r, requestID)
		}
		return "", newProtocolError("server_error", http.StatusInternalServerError)
	}
	if !user.EmailVerified {
		return h.rejectAuthorization(r, requestID)
	}

	code, codeHash, err := h.credentials.newAuthorizationCode()
	if err != nil {
		return "", newProtocolError("server_error", http.StatusInternalServerError)
	}
	redirect, err := h.database.AuthorizeOIDC(r.Context(), requestID, userID, sourceSessionID, authTime.UTC(), codeHash, h.now().UTC())
	if err != nil {
		if errors.Is(err, db.ErrOIDCAuthRequestNotFound) || errors.Is(err, db.ErrOIDCAuthRequestExpired) {
			return "", newProtocolError("invalid_request", http.StatusBadRequest)
		}
		return "", newProtocolError("server_error", http.StatusInternalServerError)
	}
	target, err := authorizationRedirect(redirect.RedirectURI, code, redirect.State)
	if err != nil {
		return "", newProtocolError("server_error", http.StatusInternalServerError)
	}
	return target, nil
}

// rejectAuthorization consumes an unusable pending request and returns a client-safe access_denied redirect.
func (h *Handler) rejectAuthorization(r *http.Request, requestID uuid.UUID) (string, *protocolError) {
	redirect, err := h.database.CancelOIDC(r.Context(), requestID, h.now().UTC())
	if err != nil {
		if errors.Is(err, db.ErrOIDCAuthRequestNotFound) {
			return "", newProtocolError("invalid_request", http.StatusBadRequest)
		}
		return "", newProtocolError("server_error", http.StatusInternalServerError)
	}
	target, err := authorizationErrorRedirect(redirect.RedirectURI, "access_denied", redirect.State)
	if err != nil {
		return "", newProtocolError("server_error", http.StatusInternalServerError)
	}
	h.audit("continuation", "denied", "access_denied")
	return target, nil
}

// tokenFormParams lists the form parameters of the authorization_code and refresh_token grants.
var tokenFormParams = map[string]struct{}{
	"grant_type": {}, "code": {}, "redirect_uri": {}, "code_verifier": {}, "refresh_token": {},
}

// authenticateTokenClient checks the confidential client credentials and writes the
// invalid_client response when they do not match.
func (h *Handler) authenticateTokenClient(w http.ResponseWriter, r *http.Request) (string, bool) {
	client, err := h.authenticatedClient(r)
	if err != nil {
		h.audit("token", "rejected", "invalid_client")
		w.Header().Set("WWW-Authenticate", `Basic realm="oauth2/token"`)
		h.writeOAuthError(w, newProtocolError("invalid_client", http.StatusUnauthorized))
		return "", false
	}
	return client.ClientID, true
}

// onlyParams reports whether values holds nothing but the allowed parameters.
func onlyParams(values url.Values, allowed map[string]struct{}) bool {
	for name := range values {
		if _, ok := allowed[name]; !ok {
			return false
		}
	}
	return true
}

// Token authenticates the confidential client and dispatches the requested supported grant.
func (h *Handler) Token(w http.ResponseWriter, r *http.Request) {
	setNoStore(w.Header())
	clientID, ok := h.authenticateTokenClient(w, r)
	if !ok {
		return
	}
	values, protocolErr := parseFormRequest(w, r, tokenFormParams)
	if protocolErr != nil {
		h.audit("token", "rejected", protocolErr.Code)
		h.writeOAuthError(w, protocolErr)
		return
	}
	grantType, ok := singleValue(values, "grant_type")
	if !ok {
		h.audit("token", "rejected", "invalid_request")
		h.writeOAuthError(w, newProtocolError("invalid_request", http.StatusBadRequest))
		return
	}
	h.oidcGrant(w, r, grantType, values, clientID)
}

// oidcGrant runs the authorization_code or refresh_token grant for an already authenticated client.
func (h *Handler) oidcGrant(
	w http.ResponseWriter,
	r *http.Request,
	grantType string,
	values url.Values,
	clientID string,
) {
	if !h.clientGrantAllowed(clientID, grantType) {
		h.writeOAuthError(w, newProtocolError("unauthorized_client", http.StatusBadRequest))
		return
	}
	switch grantType {
	case "authorization_code":
		h.authorizationCodeGrant(w, r, values, clientID)
	case "refresh_token":
		h.refreshTokenGrant(w, r, values, clientID)
	default:
		h.audit("token", "rejected", "unsupported_grant_type")
		h.writeOAuthError(w, newProtocolError("unsupported_grant_type", http.StatusBadRequest))
	}
}

// authorizationCodeGrant atomically exchanges a one-time code and PKCE verifier for the initial token set.
func (h *Handler) authorizationCodeGrant(w http.ResponseWriter, r *http.Request, values url.Values, clientID string) {
	client, _ := h.config.Registry.Client(clientID)
	if !exactRedirectAllowed(client.RedirectURIs, values.Get("redirect_uri")) {
		h.writeInvalidGrant(w)
		return
	}
	code, codeOK := singleValue(values, "code")
	redirectURI, redirectOK := singleValue(values, "redirect_uri")
	verifier, verifierOK := singleValue(values, "code_verifier")
	_, refreshPresent := values["refresh_token"]
	if !codeOK || !redirectOK || !verifierOK || refreshPresent || code == "" || redirectURI == "" || verifier == "" {
		h.audit("token", "rejected", "invalid_request")
		h.writeOAuthError(w, newProtocolError("invalid_request", http.StatusBadRequest))
		return
	}
	if err := h.credentials.validateAuthorizationCode(code); err != nil {
		h.audit("token", "rejected", "invalid_grant")
		h.writeOAuthError(w, newProtocolError("invalid_grant", http.StatusBadRequest))
		return
	}
	refreshToken, refreshTokenHash, err := service.CreateRefreshTokenPair(h.authConfig)
	if err != nil {
		h.audit("token", "error", "random_source")
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusInternalServerError))
		return
	}
	now := h.now().UTC()
	sessionID := uuid.New()
	tokens, err := h.database.ExchangeOIDCCode(r.Context(), db.OIDCExchangeRequest{
		CodeHash:         h.credentials.codeHash(code),
		ClientID:         clientID,
		RedirectURI:      redirectURI,
		CodeVerifier:     verifier,
		SessionID:        sessionID,
		FamilyID:         uuid.New(),
		RefreshTokenHash: refreshTokenHash,
		CreatedIP:        requestIP(r),
		CreatedUserAgent: optionalString(r.UserAgent()),
		SessionExpiresAt: now.Add(h.authConfig.AccessSessionTTL),
	}, func(user db.OIDCUserClaims, exchangeTime time.Time) (db.OIDCTokenSet, error) {
		client, _ := h.config.Registry.Client(clientID)
		return h.tokens.Issue(user, sessionID, exchangeTime, client)
	})
	if err != nil {
		if errors.Is(err, db.ErrOIDCInvalidGrant) || errors.Is(err, db.ErrOIDCInactiveUser) {
			h.audit("token", "rejected", "invalid_grant")
			h.writeOAuthError(w, newProtocolError("invalid_grant", http.StatusBadRequest))
			return
		}
		h.audit("token", "error", "store_or_signing")
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusInternalServerError))
		return
	}
	if strings.Contains(" "+tokens.Scope+" ", " offline_access ") {
		tokens.RefreshToken = refreshToken
	}
	h.writeTokenSet(w, tokens)
}

// refreshTokenGrant rotates an OAuth-bound refresh family and returns a new access/refresh pair.
func (h *Handler) refreshTokenGrant(w http.ResponseWriter, r *http.Request, values url.Values, clientID string) {
	refreshToken, ok := singleValue(values, "refresh_token")
	if !ok || refreshToken == "" || values.Get("code") != "" || values.Get("redirect_uri") != "" ||
		values.Get("code_verifier") != "" {
		h.audit("token", "rejected", "invalid_request")
		h.writeOAuthError(w, newProtocolError("invalid_request", http.StatusBadRequest))
		return
	}
	refreshToken, err := service.ValidateLengthOfRefreshToken(refreshToken, h.authConfig)
	if err != nil {
		h.writeInvalidGrant(w)
		return
	}
	newRefreshToken, newRefreshHash, err := service.CreateRefreshTokenPair(h.authConfig)
	if err != nil {
		h.audit("token", "error", "random_source")
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusInternalServerError))
		return
	}
	operation := r.Header.Get("Idempotency-Key")
	if len(operation) > 128 {
		h.writeInvalidGrant(w)
		return
	}
	sealed, err := h.database.RefreshOAuthResult(
		r.Context(),
		service.HashRefreshToken(refreshToken),
		newRefreshHash,
		clientID,
		operation,
		func(session model.AuthSession) (string, error) {
			client, _ := h.config.Registry.Client(clientID)
			if !allowedOIDCScopes(strings.Join(session.OAuthScopes, " "), client.OIDCScopes) {
				return "", db.ErrTokenNotFound
			}
			access, err := h.tokens.IssueAccessToken(session.SubjectID, session.ID, client)
			if err != nil {
				return "", err
			}
			raw, err := json.Marshal(
				db.OIDCTokenSet{
					AccessToken:  access,
					RefreshToken: newRefreshToken,
					ExpiresIn:    int64(h.authConfig.AccessTokenTTL / time.Second),
					Scope:        strings.Join(session.OAuthScopes, " "),
				},
			)
			if err != nil {
				return "", err
			}
			return h.credentials.seal("refresh_result:"+clientID+":"+operation, raw)
		},
	)
	if err != nil {
		if errors.Is(err, db.ErrTokenNotFound) || errors.Is(err, db.ErrTokenExpired) ||
			errors.Is(err, db.ErrTokenReuseDetected) ||
			errors.Is(err, db.ErrUserNotFound) {
			h.writeInvalidGrant(w)
			return
		}
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusInternalServerError))
		return
	}
	raw, err := h.credentials.open("refresh_result:"+clientID+":"+operation, sealed)
	if err != nil {
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusInternalServerError))
		return
	}
	var tokens db.OIDCTokenSet
	if json.Unmarshal(raw, &tokens) != nil {
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusInternalServerError))
		return
	}
	h.writeTokenSet(w, tokens)
}

// Revoke authenticates the client and idempotently revokes the refresh-token family it owns.
// @Summary Revoke an Auth session belonging to the authenticated client
// @Description Unknown credentials and credentials belonging to another client are ignored without revoking that client's session.
// @Tags oauth2
// @Security OAuthClientAuth
// @Accept x-www-form-urlencoded
// @Param token formData string true "Auth refresh token"
// @Param token_type_hint formData string false "refresh_token"
// @Success 200
// @Failure 400 {object} contract.OAuthErrorResponse
// @Failure 401 {object} contract.OAuthErrorResponse
// @Failure 500 {object} contract.OAuthErrorResponse
// @Failure 503 {string} string
// @Router /oauth2/revoke [post]
func (h *Handler) Revoke(w http.ResponseWriter, r *http.Request) {
	setNoStore(w.Header())
	client, err := h.authenticatedClient(r)
	if err != nil {
		w.Header().Set("WWW-Authenticate", `Basic realm="oauth2/revoke"`)
		h.writeOAuthError(w, newProtocolError("invalid_client", http.StatusUnauthorized))
		return
	}
	clientID := client.ClientID
	values, protocolErr := parseFormRequest(w, r, map[string]struct{}{"token": {}, "token_type_hint": {}})
	if protocolErr != nil {
		h.writeOAuthError(w, protocolErr)
		return
	}
	raw, ok := singleValue(values, "token")
	if !ok || raw == "" {
		h.writeOAuthError(w, newProtocolError("invalid_request", http.StatusBadRequest))
		return
	}
	if hint, present := values["token_type_hint"]; present && (len(hint) != 1 || hint[0] != "refresh_token") {
		h.writeOAuthError(w, newProtocolError("unsupported_token_type", http.StatusBadRequest))
		return
	}
	refreshToken, err := service.ValidateLengthOfRefreshToken(raw, h.authConfig)
	if err == nil {
		if err := h.database.RevokeOAuthSessionFamily(r.Context(), service.HashRefreshToken(refreshToken), clientID); err != nil {
			h.audit("revoke", "error", "store")
			h.writeOAuthError(w, newProtocolError("server_error", http.StatusInternalServerError))
			return
		}
	}
	h.audit("revoke", "success", "none")
	w.WriteHeader(http.StatusOK)
}

// writeInvalidGrant keeps all rejected refresh credentials indistinguishable to the caller.
func (h *Handler) writeInvalidGrant(w http.ResponseWriter) {
	h.audit("token", "rejected", "invalid_grant")
	h.writeOAuthError(w, newProtocolError("invalid_grant", http.StatusBadRequest))
}

// writeTokenSet serializes the successful OAuth response without exposing tokens to logs.
func (h *Handler) writeTokenSet(w http.ResponseWriter, tokens db.OIDCTokenSet) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	h.audit("token", "success", "none")
	_ = json.NewEncoder(w).Encode(ToOAuthTokenResponse(tokens))
}

// requestIP extracts the peer address stored with the newly issued auth session.
func requestIP(r *http.Request) string {
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

// optionalString maps absent request metadata to SQL NULL instead of an empty string.
func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

// consoleLoginURL builds the trusted login URL that returns to the provider continuation endpoint.
func (h *Handler) consoleLoginURL(opaqueID string) (string, error) {
	continuation, err := url.Parse(h.config.Issuer + "/oauth2/login/continue")
	if err != nil {
		return "", err
	}
	continuationQuery := continuation.Query()
	continuationQuery.Set("auth_request_id", opaqueID)
	continuation.RawQuery = continuationQuery.Encode()

	loginURL, err := url.Parse(h.config.LoginURL)
	if err != nil {
		return "", err
	}
	loginQuery := loginURL.Query()
	loginQuery.Set("return_to", continuation.String())
	loginURL.RawQuery = loginQuery.Encode()
	return loginURL.String(), nil
}

// requireConsoleOrigin prevents another browser origin from invoking the console continuation endpoint.
func (h *Handler) requireConsoleOrigin(w http.ResponseWriter, r *http.Request) bool {
	origins := r.Header.Values("Origin")
	loginURL, err := url.Parse(h.config.LoginURL)
	if err != nil {
		setNoStore(w.Header())
		http.Error(w, "Forbidden", http.StatusForbidden)
		return false
	}
	expected, expectedOK := canonicalOrigin(loginURL.Scheme + "://" + loginURL.Host)
	actual, actualOK := "", false
	if len(origins) == 1 {
		actual, actualOK = canonicalOrigin(origins[0])
	}
	if !expectedOK || !actualOK || actual != expected {
		setNoStore(w.Header())
		http.Error(w, "Forbidden", http.StatusForbidden)
		return false
	}
	return true
}

// parseContinuationQuery accepts only the opaque authorization request identifier from browser redirects.
func parseContinuationQuery(values url.Values) (string, *protocolError) {
	if len(values) != 1 {
		return "", newProtocolError("invalid_request", http.StatusBadRequest)
	}
	opaqueID, ok := singleValue(values, "auth_request_id")
	if !ok || opaqueID == "" {
		return "", newProtocolError("invalid_request", http.StatusBadRequest)
	}
	return opaqueID, nil
}

// parseContinuationJSON strictly decodes the bounded console continuation payload.
func parseContinuationJSON(w http.ResponseWriter, r *http.Request) (string, *protocolError) {
	if r.URL.RawQuery != "" {
		return "", newProtocolError("invalid_request", http.StatusBadRequest)
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return "", newProtocolError("invalid_request", http.StatusBadRequest)
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxFormBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var request struct {
		AuthRequestID string `json:"auth_request_id"`
	}
	if err := decoder.Decode(&request); err != nil {
		return "", newProtocolError("invalid_request", http.StatusBadRequest)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return "", newProtocolError("invalid_request", http.StatusBadRequest)
	}
	if request.AuthRequestID == "" {
		return "", newProtocolError("invalid_request", http.StatusBadRequest)
	}
	return request.AuthRequestID, nil
}

// redirectAuthorizationError sends a protocol error only to a redirect URI validated earlier in the request.
func (h *Handler) redirectAuthorizationError(
	w http.ResponseWriter,
	r *http.Request,
	request validatedAuthorizationRequest,
	code string,
) {
	h.logOAuthError(newProtocolError(code, http.StatusSeeOther))
	target, err := authorizationErrorRedirect(request.RedirectURI, code, request.State)
	if err != nil {
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusInternalServerError))
		return
	}
	setNoStore(w.Header())
	w.Header().Set("Referrer-Policy", "no-referrer")
	http.Redirect(w, r, target, http.StatusSeeOther)
}

// canonicalOrigin normalizes scheme, host, and default ports for exact same-origin comparison.
func canonicalOrigin(raw string) (string, bool) {
	origin, err := url.Parse(raw)
	if err != nil || origin.User != nil || origin.Host == "" || origin.Path != "" ||
		origin.RawQuery != "" || origin.Fragment != "" {
		return "", false
	}
	scheme := strings.ToLower(origin.Scheme)
	if scheme != "http" && scheme != "https" {
		return "", false
	}
	hostname := strings.ToLower(origin.Hostname())
	if hostname == "" {
		return "", false
	}
	port := origin.Port()
	if (scheme == "http" && port == "80") || (scheme == "https" && port == "443") {
		port = ""
	}
	host := hostname
	if port != "" {
		host = net.JoinHostPort(hostname, port)
	} else if strings.Contains(hostname, ":") {
		host = "[" + hostname + "]"
	}
	return scheme + "://" + host, true
}

// audit records protocol outcomes without including codes, tokens, secrets, or decrypted claims.
func (h *Handler) audit(stage, outcome, errorClass string) {
	logger := h.logger
	if logger == nil {
		logger = slog.Default()
	}
	logger.Info("oidc_audit", "stage", stage, "outcome", outcome, "error_class", errorClass)
}

// parseFormRequest strictly decodes a bounded OAuth form and rejects unknown or duplicate parameters.
func parseFormRequest(
	w http.ResponseWriter,
	r *http.Request,
	allowed map[string]struct{},
) (url.Values, *protocolError) {
	if r.URL.RawQuery != "" {
		return nil, newProtocolError("invalid_request", http.StatusBadRequest)
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/x-www-form-urlencoded" {
		return nil, newProtocolError("invalid_request", http.StatusBadRequest)
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxFormBytes)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, newProtocolError("invalid_request", http.StatusBadRequest)
	}
	values, err := url.ParseQuery(string(body))
	if err != nil {
		return nil, newProtocolError("invalid_request", http.StatusBadRequest)
	}
	for name, entries := range values {
		if _, ok := allowed[name]; !ok || len(entries) != 1 {
			return nil, newProtocolError("invalid_request", http.StatusBadRequest)
		}
	}
	return values, nil
}

// parseBasicCredentials extracts one client_secret_basic credential pair using OAuth form decoding rules.
func parseBasicCredentials(r *http.Request) (string, string, bool) {
	values := r.Header.Values("Authorization")
	if len(values) != 1 {
		return "", "", false
	}
	scheme, encoded, ok := strings.Cut(values[0], " ")
	if !ok || !strings.EqualFold(scheme, "Basic") || encoded == "" || strings.Contains(encoded, " ") {
		return "", "", false
	}
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", "", false
	}
	clientID, secret, ok := strings.Cut(string(decoded), ":")
	if !ok || clientID == "" || secret == "" {
		return "", "", false
	}
	clientID, err = url.QueryUnescape(clientID)
	if err != nil {
		return "", "", false
	}
	secret, err = url.QueryUnescape(secret)
	if err != nil {
		return "", "", false
	}
	return clientID, secret, true
}

// constantTimeCredentialMatch compares both client components without exposing which component differed.
func constantTimeCredentialMatch(clientID, clientSecret, expectedClientID string, expectedSecret []byte) bool {
	clientHash := sha256.Sum256([]byte(clientID))
	expectedClientHash := sha256.Sum256([]byte(expectedClientID))
	secretHash := sha256.Sum256([]byte(clientSecret))
	expectedSecretHash := sha256.Sum256(expectedSecret)
	clientOK := subtle.ConstantTimeCompare(clientHash[:], expectedClientHash[:])
	secretOK := subtle.ConstantTimeCompare(secretHash[:], expectedSecretHash[:])
	return clientOK&secretOK == 1
}

// parseBearerToken accepts exactly one well-formed Bearer authorization header.
func parseBearerToken(r *http.Request) (string, bool) {
	values := r.Header.Values("Authorization")
	if len(values) != 1 {
		return "", false
	}
	scheme, token, ok := strings.Cut(values[0], " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") || token == "" || strings.ContainsAny(token, " \t\r\n") {
		return "", false
	}
	return token, true
}
