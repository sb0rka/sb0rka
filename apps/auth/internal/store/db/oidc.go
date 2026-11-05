package db

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const (
	expiredRequestCleanupBatch = 100
)

var (
	ErrOIDCAuthRequestNotFound = errors.New("OIDC authorization request not found")
	ErrOIDCAuthRequestExpired  = errors.New("OIDC authorization request expired")
	ErrOIDCInvalidGrant        = errors.New("invalid OIDC authorization grant")
	ErrOIDCInactiveUser        = errors.New("inactive OIDC user")
	ErrOIDCAuthSessionNotFound = errors.New("OIDC authentication session not found")
)

type OIDCPendingRequest struct {
	ID            uuid.UUID
	ClientID      string
	RedirectURI   string
	State         string
	Nonce         string
	Scopes        string
	CodeChallenge string
	CreatedAt     time.Time
	ExpiresAt     time.Time
}

type OIDCClientRedirect struct {
	RedirectURI string
	State       string
}

type OIDCUserClaims struct {
	Scopes             string
	ID                 uuid.UUID
	Username           string
	Email              string
	EmailVerified      bool
	Nonce              string
	AuthenticationTime time.Time
}

type OIDCExchangeRequest struct {
	CodeHash         []byte
	ClientID         string
	RedirectURI      string
	CodeVerifier     string
	SessionID        uuid.UUID
	FamilyID         uuid.UUID
	RefreshTokenHash string
	CreatedIP        string
	CreatedUserAgent *string
	SessionExpiresAt time.Time
}

type OIDCTokenSet struct {
	Scope        string
	AccessToken  string
	RefreshToken string
	IDToken      string
	ExpiresIn    int64
}

type IssueOIDCTokensFunc func(OIDCUserClaims, time.Time) (OIDCTokenSet, error)

// CreateOIDCPending persists a validated authorization request. Authorization
// codes are represented exclusively by their HMAC hashes.
func (p *PsqlDB) CreateOIDCPending(ctx context.Context, request OIDCPendingRequest) error {
	const query = `
		WITH db_time AS (
			SELECT clock_timestamp() AS now
		), stale AS (
			SELECT request.id
			FROM oidc_auth_requests AS request
			CROSS JOIN db_time
			WHERE request.expires_at <= db_time.now
			ORDER BY request.expires_at
			LIMIT $8
			FOR UPDATE OF request SKIP LOCKED
		), deleted AS (
			DELETE FROM oidc_auth_requests AS request
			USING stale
			WHERE request.id = stale.id
		)
		INSERT INTO oidc_auth_requests (
			id, client_id, redirect_uri, state, nonce, scopes, code_challenge,
			created_at, updated_at, expires_at
		)
		SELECT $1, $2, $3, $4, $5, $6, $7, now, now, now + INTERVAL '15 minutes'
		FROM db_time
	`
	_, err := p.pool.Exec(ctx, query,
		request.ID,
		request.ClientID,
		request.RedirectURI,
		request.State,
		request.Nonce,
		request.Scopes,
		request.CodeChallenge,
		expiredRequestCleanupBatch,
	)
	if err != nil {
		return fmt.Errorf("create pending OIDC authorization request: %w", err)
	}
	return nil
}

// Authorize atomically binds a pending request to an active user and installs
// the one-time authorization-code hash. The plaintext code never reaches this
// store.
func (p *PsqlDB) AuthorizeOIDC(
	ctx context.Context,
	requestID, userID uuid.UUID,
	authTime time.Time,
	codeHash []byte,
	_ time.Time,
) (OIDCClientRedirect, error) {
	const query = `
		WITH db_time AS (
			SELECT clock_timestamp() AS now
		)
		UPDATE oidc_auth_requests AS request
		SET user_id = $2,
			auth_time = $3,
			code_hash = $4,
			authorized_at = db_time.now,
			updated_at = db_time.now,
			expires_at = db_time.now + INTERVAL '2 minutes'
		FROM db_time
		WHERE request.id = $1
		  AND request.user_id IS NULL
		  AND request.auth_time IS NULL
		  AND request.code_hash IS NULL
		  AND request.authorized_at IS NULL
		  AND request.consumed_at IS NULL
		  AND request.expires_at > db_time.now
		  AND $3 <= db_time.now
		  AND EXISTS (
			SELECT 1 FROM user_principals
			WHERE user_principals.id = $2 AND user_principals.is_active = true
		  )
		RETURNING request.redirect_uri, request.state
	`
	var redirect OIDCClientRedirect
	err := p.pool.QueryRow(ctx, query,
		requestID,
		userID,
		authTime.UTC(),
		codeHash,
	).Scan(&redirect.RedirectURI, &redirect.State)
	if errors.Is(err, pgx.ErrNoRows) {
		return OIDCClientRedirect{}, ErrOIDCAuthRequestNotFound
	}
	if err != nil {
		return OIDCClientRedirect{}, fmt.Errorf("authorize OIDC request: %w", err)
	}
	return redirect, nil
}

// Cancel removes a still-pending request and returns its already-validated
// client redirect. Expired pending rows are removed as well.
func (p *PsqlDB) CancelOIDC(ctx context.Context, requestID uuid.UUID, _ time.Time) (OIDCClientRedirect, error) {
	const query = `
		DELETE FROM oidc_auth_requests
		WHERE id = $1
		  AND user_id IS NULL
		  AND auth_time IS NULL
		  AND code_hash IS NULL
		  AND authorized_at IS NULL
		  AND consumed_at IS NULL
		RETURNING redirect_uri, state
	`
	var redirect OIDCClientRedirect
	if err := p.pool.QueryRow(ctx, query, requestID).Scan(&redirect.RedirectURI, &redirect.State); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return OIDCClientRedirect{}, ErrOIDCAuthRequestNotFound
		}
		return OIDCClientRedirect{}, fmt.Errorf("cancel OIDC request: %w", err)
	}
	return redirect, nil
}

// GetSessionAuthenticationTime resolves the original login time for the live
// bearer session, walking refresh-token rotations back to the family root.
func (p *PsqlDB) GetOIDCSessionAuthenticationTime(
	ctx context.Context,
	sessionID, userID uuid.UUID,
) (time.Time, error) {
	const query = `SELECT auth_time FROM auth_sessions WHERE id=$1 AND subject_id=$2 AND revoked_at IS NULL AND expires_at>now()`

	var authenticationTime *time.Time
	if err := p.pool.QueryRow(ctx, query, sessionID, userID).Scan(&authenticationTime); err != nil {
		return time.Time{}, fmt.Errorf("resolve OIDC authentication time: %w", err)
	}
	if authenticationTime == nil {
		return time.Time{}, ErrOIDCAuthSessionNotFound
	}
	return authenticationTime.UTC(), nil
}

// CodeExchange performs validation, token signing, and consumption under a
// row lock in one transaction. Client, redirect, or verifier failures return
// before the UPDATE and therefore do not consume the code.
func (p *PsqlDB) ExchangeOIDCCode(
	ctx context.Context,
	request OIDCExchangeRequest,
	issue IssueOIDCTokensFunc,
) (OIDCTokenSet, error) {
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return OIDCTokenSet{}, fmt.Errorf("begin OIDC code exchange: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	const lockQuery = `
		SELECT request.id,
		       request.client_id,
		       request.redirect_uri,
		       request.nonce,
		       request.scopes,
		       request.code_challenge,
		       request.auth_time,
		       request.authorized_at,
		       request.consumed_at,
		       request.expires_at,
		       user_principals.id,
		       user_principals.username,
		       user_principals.email,
		       (user_principals.email_verified_at IS NOT NULL),
		       user_principals.is_active
		FROM oidc_auth_requests AS request
		JOIN user_principals ON user_principals.id = request.user_id
 JOIN platform_clients client ON client.client_id = request.client_id
		WHERE request.code_hash = $1 AND client.revoked_at IS NULL
 AND NOT EXISTS (SELECT 1 FROM unnest(string_to_array(request.scopes, ' ')) scope WHERE NOT (client.policy->'oidc_scopes' ? scope))
		FOR UPDATE OF request, user_principals
	`
	var (
		requestID    uuid.UUID
		clientID     string
		redirectURI  string
		scopes       string
		challenge    string
		authTime     *time.Time
		authorizedAt *time.Time
		consumedAt   *time.Time
		expiresAt    time.Time
		user         OIDCUserClaims
		active       bool
	)
	err = tx.QueryRow(ctx, lockQuery, request.CodeHash).Scan(
		&requestID,
		&clientID,
		&redirectURI,
		&user.Nonce,
		&scopes,
		&challenge,
		&authTime,
		&authorizedAt,
		&consumedAt,
		&expiresAt,
		&user.ID,
		&user.Username,
		&user.Email,
		&user.EmailVerified,
		&active,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return OIDCTokenSet{}, ErrOIDCInvalidGrant
	}
	if err != nil {
		return OIDCTokenSet{}, fmt.Errorf("lock OIDC authorization code: %w", err)
	}

	var exchangeTime time.Time
	if err := tx.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&exchangeTime); err != nil {
		return OIDCTokenSet{}, fmt.Errorf("read OIDC exchange time: %w", err)
	}
	exchangeTime = exchangeTime.UTC()
	if clientID != request.ClientID || redirectURI != request.RedirectURI ||
		scopes == "" || authTime == nil || authorizedAt == nil ||
		consumedAt != nil || !expiresAt.After(exchangeTime) || !active || !user.EmailVerified ||
		request.SessionID == uuid.Nil || request.FamilyID == uuid.Nil || request.RefreshTokenHash == "" ||
		!request.SessionExpiresAt.After(exchangeTime) {
		return OIDCTokenSet{}, ErrOIDCInvalidGrant
	}
	if err := validateOIDCPKCEVerifier(request.CodeVerifier, challenge); err != nil {
		return OIDCTokenSet{}, ErrOIDCInvalidGrant
	}
	user.AuthenticationTime = authTime.UTC()
	user.Scopes = scopes
	const createSessionQuery = `
		INSERT INTO auth_sessions (
			id, subject_id, family_id, oauth_client_id,
			created_ip, created_user_agent, expires_at, auth_time, oauth_scopes
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	if _, err := tx.Exec(ctx, createSessionQuery,
		request.SessionID,
		user.ID,
		request.FamilyID,
		request.ClientID,
		request.CreatedIP,
		request.CreatedUserAgent,
		request.SessionExpiresAt.UTC(),
		user.AuthenticationTime,
		strings.Fields(scopes),
	); err != nil {
		return OIDCTokenSet{}, fmt.Errorf("create OAuth-bound auth session: %w", err)
	}

	if _, err := tx.Exec(ctx, `INSERT INTO auth_refresh_tokens(session_id,token_hash,expires_at) VALUES($1,$2,$3)`, request.SessionID, request.RefreshTokenHash, request.SessionExpiresAt); err != nil {
		return OIDCTokenSet{}, err
	}
	tokens, err := issue(user, exchangeTime)
	if err != nil {
		return OIDCTokenSet{}, fmt.Errorf("issue OIDC tokens: %w", err)
	}

	const consumeQuery = `
		UPDATE oidc_auth_requests
		SET code_hash = NULL,
			consumed_at = $2,
			updated_at = $2
		WHERE id = $1
		  AND code_hash = $3
		  AND consumed_at IS NULL
		  AND expires_at > clock_timestamp()
	`
	tag, err := tx.Exec(ctx, consumeQuery, requestID, exchangeTime, request.CodeHash)
	if err != nil {
		return OIDCTokenSet{}, fmt.Errorf("consume OIDC authorization code: %w", err)
	}
	if tag.RowsAffected() != 1 {
		return OIDCTokenSet{}, ErrOIDCInvalidGrant
	}
	if err := tx.Commit(ctx); err != nil {
		return OIDCTokenSet{}, fmt.Errorf("commit OIDC code exchange: %w", err)
	}
	return tokens, nil
}

func (p *PsqlDB) GetOIDCActiveUser(ctx context.Context, userID uuid.UUID) (OIDCUserClaims, error) {
	const query = `
		SELECT id, username, email, (email_verified_at IS NOT NULL)
		FROM user_principals
		WHERE id = $1 AND is_active = true
	`
	var user OIDCUserClaims
	if err := p.pool.QueryRow(ctx, query, userID).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.EmailVerified,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return OIDCUserClaims{}, ErrOIDCInactiveUser
		}
		return OIDCUserClaims{}, fmt.Errorf("load active OIDC user: %w", err)
	}
	return user, nil
}

func validateOIDCPKCEVerifier(verifier, expectedChallenge string) error {
	if len(verifier) < 43 || len(verifier) > 128 {
		return ErrOIDCInvalidGrant
	}
	for _, char := range verifier {
		if !isOIDCPKCEChar(char) {
			return ErrOIDCInvalidGrant
		}
	}
	digest := sha256.Sum256([]byte(verifier))
	actual := base64.RawURLEncoding.EncodeToString(digest[:])
	if !hmac.Equal([]byte(actual), []byte(expectedChallenge)) {
		return ErrOIDCInvalidGrant
	}
	return nil
}

func isOIDCPKCEChar(char rune) bool {
	return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') ||
		(char >= '0' && char <= '9') || strings.ContainsRune("-._~", char)
}
