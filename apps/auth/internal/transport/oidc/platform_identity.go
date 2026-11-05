package oidc

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	"github.com/sb0rka/sb0rka/apps/auth/internal/service"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
	"github.com/sb0rka/sb0rka/packages/contract"
	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
)

const (
	exchangeGrant   = "urn:ietf:params:oauth:grant-type:token-exchange"
	delegationGrant = "urn:sb0rka:params:oauth:grant-type:delegation"
	agentGrant      = "urn:sb0rka:params:oauth:grant-type:agent"

	accessTokenURN = "urn:ietf:params:oauth:token-type:access_token"
)

// platformTokenParams lists every form parameter accepted by POST /oauth2/token.
var platformTokenParams = map[string]struct{}{
	"grant_type": {}, "code": {}, "redirect_uri": {}, "code_verifier": {}, "refresh_token": {},
	"subject_token": {}, "subject_token_type": {}, "requested_token_type": {}, "audience": {},
	"scope": {}, "delegation_id": {}, "attestation": {},
}

func (h *Handler) platformClient(r *http.Request, workload bool) (db.PlatformClient, error) {
	c, err := h.authenticatedClient(r)
	if err != nil || (workload && c.Attestation == nil) || (!workload && len(c.DelegationPolicies) == 0) {
		return db.PlatformClient{}, coreauth.ErrUnauthorized
	}
	return h.database.PlatformClient(r.Context(), c.ClientID)
}

// infrastructureError is a database or backend failure. Missing rows and
// rejected credentials stay client errors so an outage does not look like logout.
func infrastructureError(err error) bool {
	if err == nil {
		return false
	}
	return !errors.Is(err, coreauth.ErrUnauthorized) &&
		!errors.Is(err, pgx.ErrNoRows) &&
		!errors.Is(err, db.ErrOIDCInvalidGrant) &&
		!errors.Is(err, db.ErrOIDCInactiveUser) &&
		!errors.Is(err, db.ErrTokenNotFound)
}

func (h *Handler) writeTemporarilyUnavailable(w http.ResponseWriter) {
	h.writeOAuthError(w, newProtocolError("temporarily_unavailable", http.StatusServiceUnavailable))
}

// clientUserIdentity verifies the client's own non-delegated login token and
// the original OAuth client binding of its live session.
func (h *Handler) clientUserIdentity(r *http.Request, raw string) (coreauth.AccessTokenIdentity, error) {
	client, err := h.authenticatedClient(r)
	if err != nil {
		return coreauth.AccessTokenIdentity{}, err
	}
	return h.userIdentityForClient(r.Context(), raw, client)
}

// userIdentityForClient verifies a non-delegated user login token for a specific registered client
// and the original OAuth client binding of its live session.
func (h *Handler) userIdentityForClient(ctx context.Context, raw string, client config.RegisteredClient) (coreauth.AccessTokenIdentity, error) {
	identity, err := service.VerifyAccessTokenForAudience(ctx, raw, client.AccessAudience, h.authConfig)
	if err != nil || identity.SubjectKind != coreauth.SubjectUser || identity.ActorSubjectID != "" ||
		identity.Scope != "" || identity.ClientID != client.ClientID {
		return identity, coreauth.ErrUnauthorized
	}
	sid, e1 := uuid.Parse(identity.SessionID)
	sub, e2 := uuid.Parse(identity.SubjectID)
	if e1 != nil || e2 != nil {
		return identity, coreauth.ErrUnauthorized
	}
	live, err := h.database.LiveSession(ctx, sid, sub)
	if err != nil {
		return identity, err
	}
	if !live {
		return identity, coreauth.ErrUnauthorized
	}
	session, err := h.database.GetAuthSession(ctx, sid)
	if err != nil {
		return identity, err
	}
	if session.OAuthClientID == nil || *session.OAuthClientID != client.ClientID {
		return identity, coreauth.ErrUnauthorized
	}
	return identity, nil
}

// loginClientForActor returns the single enabled login client that shares the workload client's service actor.
func loginClientForActor(registry config.ClientRegistry, actor string) (config.RegisteredClient, bool) {
	if actor == "" {
		return config.RegisteredClient{}, false
	}
	var match config.RegisteredClient
	found := false
	for _, candidate := range registry.Clients {
		if candidate.Enabled == nil || !*candidate.Enabled || candidate.ServiceActor != actor ||
			candidate.AccessAudience == "" || candidate.Attestation != nil {
			continue
		}
		if found {
			return config.RegisteredClient{}, false
		}
		match = candidate
		found = true
	}
	return match, found
}

func (h *Handler) signPlatform(claims coreauth.AccessTokenClaims) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = h.authConfig.AccessTokenKid
	token.Header["typ"] = coreauth.AccessTokenType
	return token.SignedString(h.authConfig.AccessTokenPrivateKey)
}

// PlatformToken godoc
// @Summary Exchange authorization, refresh, delegation or agent credentials
// @Description Requires the registered confidential client. Delegation preserves user identity and is bounded by live consent; agent issuance accepts only a one-use server attestation.
// @Tags oauth2
// @Security OAuthClientAuth
// @Accept x-www-form-urlencoded
// @Produce json
// @Param grant_type formData string true "Grant type"
// @Param code formData string false "One-use authorization or delegation code"
// @Param redirect_uri formData string false "Exact callback bound to the code"
// @Param code_verifier formData string false "Original PKCE verifier"
// @Param refresh_token formData string false "Auth refresh token belonging to this client"
// @Param Idempotency-Key header string false "Stable key for retrying a refresh operation"
// @Param subject_token formData string false "Registered client user access JWT for token exchange"
// @Param subject_token_type formData string false "urn:ietf:params:oauth:token-type:access_token"
// @Param requested_token_type formData string false "urn:ietf:params:oauth:token-type:access_token"
// @Param delegation_id formData string false "Approved grant UUID"
// @Param scope formData string false "Space-separated requested scopes"
// @Param audience formData string false "Registered target audience"
// @Param attestation formData string false "Opaque one-use workload attestation"
// @Success 200 {object} contract.OAuthTokenResponse
// @Failure 400 {object} contract.OAuthErrorResponse
// @Failure 401 {object} contract.OAuthErrorResponse
// @Failure 503 {object} contract.OAuthErrorResponse
// @Router /oauth2/token [post]
func (h *Handler) PlatformToken(w http.ResponseWriter, r *http.Request) {
	setNoStore(w.Header())
	values, problem := parseFormRequest(w, r, platformTokenParams)
	if problem != nil {
		h.writeOAuthError(w, problem)
		return
	}
	grant, ok := singleValue(values, "grant_type")
	if !ok {
		h.writeInvalidGrant(w)
		return
	}
	switch grant {
	case "authorization_code", "refresh_token":
		clientID, ok := h.authenticateTokenClient(w, r)
		if !ok {
			return
		}
		if !onlyParams(values, tokenFormParams) {
			h.audit("token", "rejected", "invalid_request")
			h.writeOAuthError(w, newProtocolError("invalid_request", http.StatusBadRequest))
			return
		}
		h.oidcGrant(w, r, grant, values, clientID)
		return
	case agentGrant:
		h.agentToken(w, r, values)
		return
	}

	client, err := h.platformClient(r, false)
	if infrastructureError(err) {
		h.writeTemporarilyUnavailable(w)
		return
	}
	if err != nil || !client.CanDelegate {
		h.writeOAuthError(w, newProtocolError("invalid_client", http.StatusUnauthorized))
		return
	}
	switch grant {
	case delegationGrant:
		h.redeemDelegation(w, r, client, values)
	case exchangeGrant:
		h.exchangeForAPIToken(w, r, client, values)
	default:
		h.writeOAuthError(w, newProtocolError("unsupported_grant_type", http.StatusBadRequest))
	}
}

// redeemDelegation exchanges the one-use consent callback code for the grant description.
func (h *Handler) redeemDelegation(
	w http.ResponseWriter,
	r *http.Request,
	client db.PlatformClient,
	values url.Values,
) {
	g, err := h.database.RedeemDelegation(
		r.Context(),
		h.credentials.codeHash(values.Get("code")),
		client.ClientID,
		values.Get("redirect_uri"),
		values.Get("code_verifier"),
	)
	if err != nil {
		h.writeInvalidGrant(w)
		return
	}
	writePlatformJSON(w, toDelegationGrantResponse(g))
}

// exchangeForAPIToken exchanges the client login token for its configured target audience and
// service actor, bounded by the live delegation grant, the user token and its session.
func (h *Handler) exchangeForAPIToken(
	w http.ResponseWriter,
	r *http.Request,
	client db.PlatformClient,
	values url.Values,
) {
	identity, err := h.clientUserIdentity(r, values.Get("subject_token"))
	if infrastructureError(err) {
		h.writeTemporarilyUnavailable(w)
		return
	}
	if err != nil {
		h.writeInvalidGrant(w)
		return
	}
	requestedType := values.Get("requested_token_type")
	registered, _ := h.config.Registry.Client(client.ClientID)
	audience := values.Get("audience")
	if values.Get("subject_token_type") != accessTokenURN || len(registered.DelegationPolicies[audience]) == 0 ||
		(requestedType != "" && requestedType != accessTokenURN) {
		h.writeOAuthError(w, newProtocolError("invalid_target", http.StatusBadRequest))
		return
	}
	sub := uuid.MustParse(identity.SubjectID)
	g, err := h.database.DelegationGrant(r.Context(), sub, client.ClientID, audience)
	if infrastructureError(err) {
		h.writeTemporarilyUnavailable(w)
		return
	}
	scopes := strings.Fields(values.Get("scope"))
	if err != nil || g.ID.String() != values.Get("delegation_id") || len(scopes) == 0 || !uniqueStrings(scopes, 16) {
		h.writeOAuthError(w, newProtocolError("invalid_scope", http.StatusBadRequest))
		return
	}
	live, err := h.database.LiveDelegation(r.Context(), g, scopes, g.ProjectIDs)
	if err != nil {
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusServiceUnavailable))
		return
	}
	if !live {
		h.writeOAuthError(w, newProtocolError("invalid_scope", http.StatusBadRequest))
		return
	}
	now := time.Now().UTC()
	deadline := now.Add(h.authConfig.AccessTokenTTL)
	if identity.ExpiresAt.Before(deadline) {
		deadline = identity.ExpiresAt
	}
	session, err := h.database.GetAuthSession(r.Context(), uuid.MustParse(identity.SessionID))
	if infrastructureError(err) {
		h.writeTemporarilyUnavailable(w)
		return
	}
	if err != nil {
		h.writeInvalidGrant(w)
		return
	}
	if session.ExpiresAt.Before(deadline) {
		deadline = session.ExpiresAt
	}
	if !deadline.After(now) {
		h.writeInvalidGrant(w)
		return
	}
	jti := uuid.New()
	scope := strings.Join(scopes, " ")
	token, err := h.signPlatform(coreauth.AccessTokenClaims{
		SessionID:         identity.SessionID,
		SubjectKind:       coreauth.SubjectUser,
		ClientID:          client.ClientID,
		Actor:             &coreauth.Actor{SubjectID: client.ActorSubjectID.String()},
		Scope:             scope,
		DelegationID:      g.ID.String(),
		DelegationVersion: g.Version,
		ProjectIDs:        g.ProjectIDs,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    h.authConfig.AccessTokenIssuer,
			Subject:   identity.SubjectID,
			Audience:  jwt.ClaimStrings{audience},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(deadline),
			ID:        jti.String(),
		},
	})
	if err != nil {
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusInternalServerError))
		return
	}
	if err = h.database.AuditPlatform(r.Context(), "delegation.exchange", client.ClientID, &sub, nil, nil, &jti, "", "issued"); err != nil {
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusInternalServerError))
		return
	}
	writePlatformJSON(w, contract.OAuthTokenResponse{
		AccessToken:     token,
		TokenType:       "Bearer",
		ExpiresIn:       int64(deadline.Sub(now) / time.Second),
		Scope:           scope,
		IssuedTokenType: accessTokenURN,
	})
}

// DelegationRequest godoc
// @Summary Start separate API integration consent
// @Tags oauth2
// @Security OAuthClientAuth
// @Accept x-www-form-urlencoded
// @Produce json
// @Param audience formData string false "Target audience; defaults to sb0rka-api"
// @Param subject_token formData string true "Registered client user access JWT"
// @Param redirect_uri formData string true "Exact registered callback"
// @Param state formData string true "Client request binding"
// @Param code_challenge formData string true "PKCE S256 challenge"
// @Success 200 {object} contract.DelegationRequestResponse
// @Failure 400 {object} contract.OAuthErrorResponse
// @Failure 401 {object} contract.OAuthErrorResponse
// @Router /oauth2/delegations/request [post]
func (h *Handler) DelegationRequest(w http.ResponseWriter, r *http.Request) {
	setNoStore(w.Header())
	client, err := h.platformClient(r, false)
	if infrastructureError(err) {
		h.writeTemporarilyUnavailable(w)
		return
	}
	if err != nil || !client.CanDelegate {
		h.writeOAuthError(w, newProtocolError("invalid_client", http.StatusUnauthorized))
		return
	}
	values, problem := parseFormRequest(
		w,
		r,
		map[string]struct{}{"subject_token": {}, "redirect_uri": {}, "state": {}, "code_challenge": {}, "audience": {}},
	)
	if problem != nil {
		h.writeOAuthError(w, problem)
		return
	}
	identity, err := h.clientUserIdentity(r, values.Get("subject_token"))
	if infrastructureError(err) {
		h.writeTemporarilyUnavailable(w)
		return
	}
	if err != nil {
		h.writeInvalidGrant(w)
		return
	}
	redirect, state, challenge := values.Get("redirect_uri"), values.Get("state"), values.Get("code_challenge")
	registered, _ := h.config.Registry.Client(client.ClientID)
	audience := values.Get("audience")
	if audience == "" {
		audience = coreauth.AudienceAPI
	}
	if len(registered.DelegationPolicies[audience]) == 0 || !exactRedirectAllowed(registered.RedirectURIs, redirect) ||
		state == "" ||
		len(state) > 1024 ||
		!validS256Challenge(challenge) {
		h.writeOAuthError(w, newProtocolError("invalid_request", http.StatusBadRequest))
		return
	}
	id := uuid.New()
	if err = h.database.CreateDelegationRequest(r.Context(), db.DelegationRequest{ID: id, SourceSessionID: uuid.MustParse(identity.SessionID), SubjectID: uuid.MustParse(identity.SubjectID), ClientID: client.ClientID, RedirectURI: redirect, State: state, CodeChallenge: challenge, Audience: audience}); err != nil {
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusInternalServerError))
		return
	}
	writePlatformJSON(
		w,
		contract.DelegationRequestResponse{
			AuthorizeURL: h.config.Issuer + "/oauth2/delegations/consent?request_id=" + id.String(),
		},
	)
}

// delegationSubject authenticates the registered client and resolves the user behind the subject token.
// On failure it has already written the OAuth error response.
func (h *Handler) delegationSubject(
	w http.ResponseWriter,
	r *http.Request,
) (db.PlatformClient, uuid.UUID, string, bool) {
	client, err := h.platformClient(r, false)
	if infrastructureError(err) {
		h.writeTemporarilyUnavailable(w)
		return db.PlatformClient{}, uuid.Nil, "", false
	}
	if err != nil {
		h.writeOAuthError(w, newProtocolError("invalid_client", http.StatusUnauthorized))
		return db.PlatformClient{}, uuid.Nil, "", false
	}
	values, problem := parseFormRequest(w, r, map[string]struct{}{"subject_token": {}, "audience": {}})
	if problem != nil {
		h.writeOAuthError(w, problem)
		return db.PlatformClient{}, uuid.Nil, "", false
	}
	identity, err := h.clientUserIdentity(r, values.Get("subject_token"))
	if infrastructureError(err) {
		h.writeTemporarilyUnavailable(w)
		return db.PlatformClient{}, uuid.Nil, "", false
	}
	if err != nil {
		h.writeInvalidGrant(w)
		return db.PlatformClient{}, uuid.Nil, "", false
	}
	audience := values.Get("audience")
	if audience == "" {
		audience = coreauth.AudienceAPI
	}
	registered, _ := h.config.Registry.Client(client.ClientID)
	if len(registered.DelegationPolicies[audience]) == 0 {
		h.writeInvalidGrant(w)
		return db.PlatformClient{}, uuid.Nil, "", false
	}
	return client, uuid.MustParse(identity.SubjectID), audience, true
}

// DelegationStatus godoc
// @Summary Read the user's API integration grant
// @Tags oauth2
// @Security OAuthClientAuth
// @Accept x-www-form-urlencoded
// @Produce json
// @Param audience formData string false "Target audience; defaults to sb0rka-api"
// @Param subject_token formData string true "Registered client user access JWT"
// @Success 200 {object} contract.DelegationStatusResponse
// @Failure 400 {object} contract.OAuthErrorResponse
// @Failure 401 {object} contract.OAuthErrorResponse
// @Router /oauth2/delegations/status [post]
func (h *Handler) DelegationStatus(w http.ResponseWriter, r *http.Request) {
	setNoStore(w.Header())
	client, sub, audience, ok := h.delegationSubject(w, r)
	if !ok {
		return
	}
	g, err := h.database.DelegationGrant(r.Context(), sub, client.ClientID, audience)
	if errors.Is(err, pgx.ErrNoRows) {
		writePlatformJSON(w, contract.DelegationStatusResponse{Connected: false})
		return
	}
	if err != nil {
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusInternalServerError))
		return
	}
	response := toDelegationGrantResponse(g)
	writePlatformJSON(w, contract.DelegationStatusResponse{Connected: true, DelegationGrantResponse: &response})
}

// DelegationRevoke godoc
// @Summary Revoke the user's API integration grant
// @Description Revocation applies across sessions and preserves application login.
// @Tags oauth2
// @Security OAuthClientAuth
// @Accept x-www-form-urlencoded
// @Produce json
// @Param audience formData string false "Target audience; defaults to sb0rka-api"
// @Param subject_token formData string true "Registered client user access JWT"
// @Success 204
// @Failure 400 {object} contract.OAuthErrorResponse
// @Failure 401 {object} contract.OAuthErrorResponse
// @Router /oauth2/delegations/revoke [post]
func (h *Handler) DelegationRevoke(w http.ResponseWriter, r *http.Request) {
	setNoStore(w.Header())
	client, sub, audience, ok := h.delegationSubject(w, r)
	if !ok {
		return
	}
	if err := h.database.RevokeDelegation(r.Context(), sub, client.ClientID, audience); err != nil {
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusInternalServerError))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func toDelegationGrantResponse(g db.DelegationGrant) contract.DelegationGrantResponse {
	return contract.DelegationGrantResponse{
		ActorSubjectID: g.ActorSubjectID,
		Audience:       g.Audience,
		DelegationID:   g.ID,
		Version:        g.Version,
		Scopes:         g.Scopes,
		ProjectIDs:     g.ProjectIDs,
	}
}

func uniqueStrings(values []string, max int) bool {
	if len(values) == 0 || len(values) > max {
		return false
	}
	seen := map[string]bool{}
	for _, v := range values {
		if v == "" || len(v) > 128 || seen[v] {
			return false
		}
		seen[v] = true
	}
	return true
}
func writePlatformJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_ = json.NewEncoder(w).Encode(value)
}

func (h *Handler) consentProjects(r *http.Request, user, sid uuid.UUID) ([]contract.ProjectResponse, error) {
	token, err := service.CreateClientAccessToken(
		user,
		sid,
		coreauth.SubjectUser,
		coreauth.ClientConsent,
		h.authConfig.AccessTokenAudience,
		h.authConfig,
	)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(
		r.Context(),
		http.MethodGet,
		strings.TrimSuffix(h.config.PlatformAPIBaseURL, "/")+"/projects",
		nil,
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	client := &http.Client{
		Timeout:       5 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, coreauth.ErrUnauthorized
	}
	var projects contract.ProjectListResponse
	err = json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&projects)
	return projects.Projects, err
}

// ReserveAgent godoc
// @Summary Reserve an agent principal for a host
// @Description Workload client authentication plus the user's login token for the client that shares this service actor. Idempotent for the same host and owner. The key is filled later by attestation.
// @Tags oauth2
// @Security OAuthClientAuth
// @Accept json
// @Produce json
// @Param body body contract.ReserveAgentRequest true "Host to reserve"
// @Success 200 {object} contract.ReserveAgentResponse
// @Failure 400 {object} contract.OAuthErrorResponse
// @Failure 401 {object} contract.OAuthErrorResponse
// @Failure 503 {object} contract.OAuthErrorResponse
// @Router /oauth2/agents [post]
func (h *Handler) ReserveAgent(w http.ResponseWriter, r *http.Request) {
	setNoStore(w.Header())
	client, err := h.platformClient(r, true)
	if infrastructureError(err) {
		h.writeTemporarilyUnavailable(w)
		return
	}
	if err != nil || !client.CanAttest {
		h.writeOAuthError(w, newProtocolError("invalid_client", http.StatusUnauthorized))
		return
	}
	var body contract.ReserveAgentRequest
	decoder := json.NewDecoder(io.LimitReader(r.Body, 8192))
	decoder.DisallowUnknownFields()
	if err = decoder.Decode(&body); err != nil || body.HostID == uuid.Nil {
		h.writeOAuthError(w, newProtocolError("invalid_request", http.StatusBadRequest))
		return
	}
	workload, ok := h.config.Registry.Client(client.ClientID)
	if !ok {
		h.writeTemporarilyUnavailable(w)
		return
	}
	login, ok := loginClientForActor(h.config.Registry, workload.ServiceActor)
	if !ok {
		h.writeTemporarilyUnavailable(w)
		return
	}
	identity, err := h.userIdentityForClient(r.Context(), strings.TrimSpace(body.SubjectToken), login)
	if infrastructureError(err) {
		h.writeTemporarilyUnavailable(w)
		return
	}
	ownerID, parseErr := uuid.Parse(identity.SubjectID)
	if err != nil || parseErr != nil || ownerID == uuid.Nil {
		h.writeInvalidGrant(w)
		return
	}
	subjectID, err := h.database.ReserveAgent(r.Context(), client.ClientID, body.HostID, ownerID)
	if errors.Is(err, db.ErrOIDCInvalidGrant) {
		h.writeInvalidGrant(w)
		return
	}
	if err != nil {
		h.writeTemporarilyUnavailable(w)
		return
	}
	writePlatformJSON(w, contract.ReserveAgentResponse{SubjectID: subjectID})
}

func (h *Handler) agentToken(w http.ResponseWriter, r *http.Request, values url.Values) {
	client, err := h.platformClient(r, true)
	if infrastructureError(err) {
		h.writeTemporarilyUnavailable(w)
		return
	}
	if err != nil || !client.CanAttest {
		h.writeOAuthError(w, newProtocolError("invalid_client", http.StatusUnauthorized))
		return
	}
	var a contract.AgentAttestation
	audited := false
	defer func() {
		if audited {
			return
		}
		ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 2*time.Second)
		defer cancel()
		var host, attestation *uuid.UUID
		if a.HostID != uuid.Nil {
			host = &a.HostID
		}
		if a.ID != uuid.Nil {
			attestation = &a.ID
		}
		_ = h.database.AuditPlatform(
			ctx,
			"agent.attest",
			client.ClientID,
			a.SubjectID,
			host,
			attestation,
			nil,
			a.KeyThumbprint,
			"rejected",
		)
	}()
	for name := range values {
		if name != "grant_type" && name != "attestation" && name != "audience" {
			h.writeOAuthError(w, newProtocolError("invalid_request", http.StatusBadRequest))
			return
		}
	}
	registered, _ := h.config.Registry.Client(client.ClientID)
	body, _ := json.Marshal(map[string]string{"attestation": values.Get("attestation")})
	req, err := http.NewRequestWithContext(
		r.Context(),
		http.MethodPost,
		registered.Attestation.ConsumeURL,
		bytes.NewReader(body),
	)
	if err != nil {
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusServiceUnavailable))
		return
	}
	req.Header.Set("Authorization", "Bearer "+string(registered.Attestation.Secret))
	req.Header.Set("Content-Type", "application/json")
	httpClient := &http.Client{
		Timeout:       5 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	res, err := httpClient.Do(req)
	if err != nil {
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusServiceUnavailable))
		return
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK || json.NewDecoder(io.LimitReader(res.Body, 8192)).Decode(&a) != nil {
		h.writeInvalidGrant(w)
		return
	}
	now := time.Now().UTC()
	pub, err := base64.RawURLEncoding.DecodeString(a.PublicKey)
	sum := sha256.Sum256(pub)
	if err != nil || len(pub) != 32 || a.HostID == uuid.Nil || a.ID == uuid.Nil || a.ExpiresAt <= now.Unix() ||
		a.VerifiedAt > now.Add(30*time.Second).Unix() ||
		a.VerifiedAt < now.Add(-60*time.Second).Unix() ||
		a.ExpiresAt > a.VerifiedAt+60 ||
		a.KeyThumbprint != base64.RawURLEncoding.EncodeToString(sum[:]) {
		h.writeInvalidGrant(w)
		return
	}
	var identity db.AgentIdentity
	if a.Purpose == "revoke" {
		if a.SubjectID == nil {
			h.writeInvalidGrant(w)
			return
		}
		identity, err = h.database.AgentIdentity(r.Context(), client.ClientID, *a.SubjectID)
		if err != nil || identity.HostID != a.HostID || identity.Thumbprint != a.KeyThumbprint ||
			!bytes.Equal(identity.PublicKey, pub) {
			h.writeInvalidGrant(w)
			return
		}
		if err = h.database.RevokeAgent(r.Context(), client.ClientID, identity.SubjectID, a.ID); err != nil {
			h.writeOAuthError(w, newProtocolError("server_error", http.StatusServiceUnavailable))
			return
		}
		audited = true
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if a.Purpose == "enroll" && a.SubjectID == nil {
		identity, err = h.database.EnrollAgent(r.Context(), client.ClientID, a.HostID, pub, a.KeyThumbprint, a.ID)
	} else if a.Purpose == "issue" && a.SubjectID != nil {
		identity, err = h.database.AgentIdentity(r.Context(), client.ClientID, *a.SubjectID)
		// A reserved principal has no key yet. The first issue after prepare fills it.
		if err == nil && !identity.Revoked && len(identity.PublicKey) == 0 {
			identity, err = h.database.EnrollAgent(r.Context(), client.ClientID, a.HostID, pub, a.KeyThumbprint, a.ID)
			if err == nil && identity.SubjectID != *a.SubjectID {
				h.writeInvalidGrant(w)
				return
			}
		}
	} else {
		h.writeInvalidGrant(w)
		return
	}
	if err != nil || identity.Revoked || identity.HostID != a.HostID || identity.Thumbprint != a.KeyThumbprint ||
		!bytes.Equal(identity.PublicKey, pub) {
		h.writeInvalidGrant(w)
		return
	}
	audience := coreauth.AudienceRelay
	scope := coreauth.ScopeRelayConnect
	rawAudience, audienceOK := optionalSingleValue(values, "audience")
	if !audienceOK {
		h.writeOAuthError(w, newProtocolError("invalid_request", http.StatusBadRequest))
		return
	}
	if rawAudience != "" {
		switch rawAudience {
		case coreauth.AudienceRelay:
		case coreauth.AudienceAPI:
			audience = coreauth.AudienceAPI
			scope = coreauth.AgentAPIScope
		default:
			h.writeOAuthError(w, newProtocolError("invalid_request", http.StatusBadRequest))
			return
		}
	}
	jti := uuid.New()
	token, err := h.signPlatform(coreauth.AccessTokenClaims{
		SubjectKind:   coreauth.SubjectAgent,
		ClientID:      client.ClientID,
		HostID:        a.HostID.String(),
		KeyThumbprint: a.KeyThumbprint,
		Scope:         scope,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   identity.SubjectID.String(),
			Issuer:    h.authConfig.AccessTokenIssuer,
			Audience:  jwt.ClaimStrings{audience},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(h.authConfig.AccessTokenTTL)),
			ID:        jti.String(),
		},
	})
	if err != nil {
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusInternalServerError))
		return
	}
	if err = h.database.AuditPlatform(r.Context(), "agent."+a.Purpose, client.ClientID, &identity.SubjectID, &a.HostID, &a.ID, &jti, a.KeyThumbprint, "issued"); err != nil {
		h.writeOAuthError(w, newProtocolError("server_error", http.StatusInternalServerError))
		return
	}
	audited = true
	writePlatformJSON(
		w,
		contract.AgentTokenResponse{
			AccessToken: token,
			TokenType:   "Bearer",
			ExpiresIn:   int64(h.authConfig.AccessTokenTTL / time.Second),
			SubjectID:   identity.SubjectID,
		},
	)
}
