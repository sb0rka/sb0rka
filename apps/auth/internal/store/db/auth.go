package db

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"
)

// pgForeignKeyViolation is the PostgreSQL SQLSTATE for foreign_key_violation.
const pgForeignKeyViolation = "23503"

// sessionColumns is the auth_sessions projection scanned by scanSession; the
// session row is joined as "s" and its subject as "u".
const sessionColumns = `
	s.id, s.subject_id, u.kind, s.family_id, s.oauth_client_id,
	s.created_ip, s.created_user_agent,
	s.revoke_reason, s.revoked_at, s.created_at, s.expires_at, s.replaced_by, s.oauth_scopes`

func scanSession(row pgx.Row) (model.AuthSession, error) {
	var s model.AuthSession
	err := row.Scan(
		&s.ID, &s.SubjectID, &s.SubjectKind, &s.FamilyID, &s.OAuthClientID,
		&s.CreatedIP, &s.CreatedUserAgent, &s.RevokeReason, &s.RevokedAt, &s.CreatedAt, &s.ExpiresAt, &s.ReplacedBy, &s.OAuthScopes,
	)
	return s, err
}

// CreateAuthSession creates a session and its first refresh token after login
func (p *PsqlDB) CreateAuthSession(ctx context.Context, sessionID uuid.UUID, subjectID, familyID uuid.UUID, refreshTokenHash, createdIP string, createdUserAgent *string, expiresAt time.Time) (model.AuthSession, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.AuthSession{}, err
	}
	defer tx.Rollback(ctx)

	const insertSessionQuery = `
		INSERT INTO auth_sessions (id, subject_id, family_id, created_ip, created_user_agent, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	if _, err = tx.Exec(ctx, insertSessionQuery, sessionID, subjectID, familyID, createdIP, createdUserAgent, expiresAt); err != nil {
		var pgErr *pgconn.PgError
		// subject_id references subjects(id) foreign_key_violation
		if errors.As(err, &pgErr) && pgErr.Code == pgForeignKeyViolation {
			return model.AuthSession{}, ErrUserNotFound
		}
		return model.AuthSession{}, err
	}

	const insertRefreshTokenQuery = `
		INSERT INTO auth_refresh_tokens (session_id, token_hash, expires_at)
		VALUES ($1, $2, $3)
	`
	if _, err = tx.Exec(ctx, insertRefreshTokenQuery, sessionID, refreshTokenHash, expiresAt); err != nil {
		return model.AuthSession{}, err
	}

	session, err := scanSession(tx.QueryRow(ctx, `
		SELECT `+sessionColumns+`
		FROM auth_sessions s
		JOIN subjects u ON u.id = s.subject_id
		WHERE s.id = $1
	`, sessionID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.AuthSession{}, ErrUnexpectedEmptyReturn
		}
		return model.AuthSession{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return model.AuthSession{}, err
	}
	return session, nil
}

func (p *PsqlDB) GetAuthSession(ctx context.Context, sessionID uuid.UUID) (model.AuthSession, error) {
	session, err := scanSession(p.pool.QueryRow(ctx, `
		SELECT `+sessionColumns+`
		FROM auth_sessions s
		JOIN subjects u ON u.id = s.subject_id
		WHERE s.id = $1
	`, sessionID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.AuthSession{}, ErrTokenNotFound
		}
		return model.AuthSession{}, err
	}
	return session, nil
}

// ResolveBrowserSession resolves a current refresh cookie without rotating or
// otherwise mutating its session. Refresh rotation only replaces the token row
// and keeps the session, so auth_time stays stable across rotations.
func (p *PsqlDB) ResolveBrowserSession(ctx context.Context, refreshTokenHash string) (model.BrowserSession, error) {
	const query = `
		SELECT s.id, s.subject_id, s.auth_time
		FROM auth_sessions s
		JOIN auth_refresh_tokens t ON t.session_id = s.id
		JOIN user_principals u ON u.id = s.subject_id
		WHERE t.token_hash = $1
			AND t.consumed_at IS NULL
			AND t.expires_at > NOW()
			AND s.revoked_at IS NULL
			AND s.expires_at > NOW()
			AND s.oauth_client_id IS NULL
			AND u.is_active
	`

	var session model.BrowserSession
	err := p.pool.QueryRow(ctx, query, refreshTokenHash).Scan(
		&session.SessionID,
		&session.SubjectID,
		&session.AuthenticationTime,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.BrowserSession{}, ErrTokenNotFound
		}
		return model.BrowserSession{}, err
	}
	return session, nil
}

func (p *PsqlDB) RefreshAuthSession(ctx context.Context, oldRefreshTokenHash string, newSessionID uuid.UUID, newRefreshTokenHash, createdIP string, createdUserAgent *string, expiresAt time.Time) (model.AuthSession, error) {
	return p.refreshAuthSession(ctx, oldRefreshTokenHash, newSessionID, newRefreshTokenHash, createdIP, createdUserAgent, expiresAt, nil)
}

func (p *PsqlDB) RefreshOAuthSession(ctx context.Context, oldRefreshTokenHash string, newSessionID uuid.UUID, newRefreshTokenHash, createdIP string, createdUserAgent *string, expiresAt time.Time, oauthClientID string) (model.AuthSession, error) {
	if oauthClientID == "" {
		return model.AuthSession{}, ErrTokenNotFound
	}
	return p.refreshAuthSession(ctx, oldRefreshTokenHash, newSessionID, newRefreshTokenHash, createdIP, createdUserAgent, expiresAt, &oauthClientID)
}

func (p *PsqlDB) refreshAuthSession(ctx context.Context, oldRefreshTokenHash string, newTokenID uuid.UUID, newRefreshTokenHash, createdIP string, createdUserAgent *string, expiresAt time.Time, expectedOAuthClientID *string) (model.AuthSession, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.AuthSession{}, err
	}
	defer tx.Rollback(ctx)

	session, oldTokenID, consumed, err := lockRefresh(ctx, tx, oldRefreshTokenHash, expectedOAuthClientID)
	if err != nil {
		return session, err
	}

	// A consumed refresh token presented again means it leaked: revoke the session

	if consumed {
		const revokeReusedQuery = `
			UPDATE auth_sessions
			SET revoked_at = COALESCE(revoked_at, NOW()), revoke_reason = 'reuse_detected'
			WHERE id = $1
		`
		if _, err = tx.Exec(ctx, revokeReusedQuery, session.ID); err != nil {
			return session, err
		}
		if err = tx.Commit(ctx); err != nil {
			return session, err
		}
		return session, ErrTokenReuseDetected
	}

	if err = rotateRefresh(ctx, tx, session, oldTokenID, newTokenID, newRefreshTokenHash); err != nil {
		return session, err
	}
	if err = tx.Commit(ctx); err != nil {
		return session, err
	}
	return session, nil
}

// lockRefresh locks a refresh token and its session, then checks that the OAuth
// client binding matches, the session and token are still valid and the user is active.
// The returned flag reports whether the token was already consumed.
func lockRefresh(ctx context.Context, tx pgx.Tx, refreshTokenHash string, expectedOAuthClientID *string) (model.AuthSession, uuid.UUID, bool, error) {
	var tokenID, sessionID uuid.UUID
	var consumedAt *time.Time
	var tokenExpiresAt time.Time
	const selectTokenQuery = `
		SELECT id, session_id, consumed_at, expires_at
		FROM auth_refresh_tokens
		WHERE token_hash = $1
		FOR UPDATE
	`
	err := tx.QueryRow(ctx, selectTokenQuery, refreshTokenHash).Scan(&tokenID, &sessionID, &consumedAt, &tokenExpiresAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.AuthSession{}, tokenID, false, ErrTokenNotFound
		}
		return model.AuthSession{}, tokenID, false, err
	}

	session, err := scanSession(tx.QueryRow(ctx, `
		SELECT `+sessionColumns+`
		FROM auth_sessions s
		JOIN subjects u ON u.id = s.subject_id
		WHERE s.id = $1
		FOR UPDATE OF s
	`, sessionID))
	if err != nil {
		return session, tokenID, false, err
	}

	// Native (cookie) refresh and each OAuth client may only use their own tokens

	if expectedOAuthClientID == nil {
		if session.OAuthClientID != nil {
			return session, tokenID, false, ErrTokenNotFound
		}
	} else if session.OAuthClientID == nil || *session.OAuthClientID != *expectedOAuthClientID {
		return session, tokenID, false, ErrTokenNotFound
	}

	// Check if the session is revoked or the session/token is expired

	now := time.Now()
	if session.RevokedAt != nil || !session.ExpiresAt.After(now) || !tokenExpiresAt.After(now) {
		return session, tokenID, false, ErrTokenExpired
	}

	// Check if the user is active

	var isUserActive bool
	if err = tx.QueryRow(ctx, `SELECT is_active FROM user_principals WHERE id = $1`, session.SubjectID).Scan(&isUserActive); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return session, tokenID, false, ErrUserNotFound
		}
		return session, tokenID, false, err
	}
	if !isUserActive {
		return session, tokenID, false, ErrUserNotFound
	}
	return session, tokenID, consumedAt != nil, nil
}

// rotateRefresh consumes the old refresh token and links the newly inserted one to it.
// replaced_by references auth_refresh_tokens(id), so it is back-filled after the insert.
func rotateRefresh(ctx context.Context, tx pgx.Tx, session model.AuthSession, oldTokenID, newTokenID uuid.UUID, newRefreshTokenHash string) error {
	if _, err := tx.Exec(ctx, `UPDATE auth_refresh_tokens SET consumed_at = NOW() WHERE id = $1`, oldTokenID); err != nil {
		return err
	}
	const insertTokenQuery = `
		INSERT INTO auth_refresh_tokens (id, session_id, token_hash, expires_at)
		VALUES ($1, $2, $3, $4)
	`
	if _, err := tx.Exec(ctx, insertTokenQuery, newTokenID, session.ID, newRefreshTokenHash, session.ExpiresAt); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `UPDATE auth_refresh_tokens SET replaced_by = $2 WHERE id = $1`, oldTokenID, newTokenID)
	return err
}

// RefreshOAuthResult rotates a refresh token and stores the sealed response in the same
// transaction, so a retried request with the same operation (idempotency key) replays the
// first result instead of tripping reuse detection. issue signs the new tokens and returns
// the sealed response; an empty client selects the native cookie flow.
func (p *PsqlDB) RefreshOAuthResult(ctx context.Context, oldRefreshTokenHash, newRefreshTokenHash, oauthClientID, operation string, issue func(model.AuthSession) (string, error)) (string, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	var expectedOAuthClientID *string
	if oauthClientID != "" {
		expectedOAuthClientID = &oauthClientID
	}
	session, oldTokenID, consumed, err := lockRefresh(ctx, tx, oldRefreshTokenHash, expectedOAuthClientID)
	if err != nil {
		return "", err
	}

	// A consumed token is a legitimate retry only while its sealed response is still stored

	if consumed {
		const selectReplayQuery = `
			SELECT response_encrypted
			FROM auth_refresh_tokens
			WHERE id = $1 AND operation_id = $2 AND response_expires_at > NOW()
		`
		var sealed string
		err = tx.QueryRow(ctx, selectReplayQuery, oldTokenID, operation).Scan(&sealed)
		if operation != "" && err == nil {
			return sealed, tx.Commit(ctx)
		}

		const revokeReusedQuery = `
			UPDATE auth_sessions
			SET revoked_at = NOW(), revoke_reason = 'reuse_detected'
			WHERE id = $1
		`
		if _, err = tx.Exec(ctx, revokeReusedQuery, session.ID); err != nil {
			return "", err
		}
		if err = tx.Commit(ctx); err != nil {
			return "", err
		}
		return "", ErrTokenReuseDetected
	}

	sealed, err := issue(session)
	if err != nil {
		return "", err
	}
	if err = rotateRefresh(ctx, tx, session, oldTokenID, uuid.New(), newRefreshTokenHash); err != nil {
		return "", err
	}
	const storeReplayQuery = `
		UPDATE auth_refresh_tokens
		SET operation_id = $2, response_encrypted = $3, response_expires_at = NOW() + INTERVAL '5 minutes'
		WHERE id = $1
	`
	if _, err = tx.Exec(ctx, storeReplayQuery, oldTokenID, operation, sealed); err != nil {
		return "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return "", err
	}
	return sealed, nil
}

// RevokeOAuthSessionFamily revokes the session behind a refresh token, but only for the OAuth client that owns it.
func (p *PsqlDB) RevokeOAuthSessionFamily(ctx context.Context, refreshTokenHash, oauthClientID string) error {
	if oauthClientID == "" {
		return nil
	}
	const query = `
		UPDATE auth_sessions s
		SET revoked_at = COALESCE(s.revoked_at, NOW()),
			revoke_reason = COALESCE(s.revoke_reason, 'oauth_client_revoke')
		FROM auth_refresh_tokens t
		WHERE t.session_id = s.id
			AND t.token_hash = $1
			AND s.oauth_client_id = $2
	`
	_, err := p.pool.Exec(ctx, query, refreshTokenHash, oauthClientID)
	return err
}

func (p *PsqlDB) ListAuthSessions(ctx context.Context, subjectID uuid.UUID) ([]model.AuthSession, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT `+sessionColumns+`
		FROM auth_sessions s
		JOIN subjects u ON u.id = s.subject_id
		WHERE s.subject_id = $1
			AND s.revoked_at IS NULL
			AND s.expires_at > NOW()
		ORDER BY s.created_at DESC
	`, subjectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sessions := make([]model.AuthSession, 0)
	for rows.Next() {
		session, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return sessions, nil
}

func (p *PsqlDB) RevokeAuthSession(ctx context.Context, sessionID, subjectID uuid.UUID, reason string, replacedBy *uuid.UUID) error {
	const query = `
		UPDATE auth_sessions
		SET
			revoked_at = COALESCE(revoked_at, NOW()),
			revoke_reason = COALESCE(revoke_reason, $2),
			replaced_by = COALESCE(replaced_by, $3)
		WHERE id = $1
			AND subject_id = $4
	`
	tag, err := p.pool.Exec(ctx, query, sessionID, reason, replacedBy, subjectID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrTokenNotFound
	}
	return nil
}

func (p *PsqlDB) RevokeAllAuthSessions(ctx context.Context, subjectID uuid.UUID) error {
	const query = `
		UPDATE auth_sessions
		SET revoked_at = NOW(), revoke_reason = 'logout'
		WHERE subject_id = $1 AND revoked_at IS NULL
	`
	_, err := p.pool.Exec(ctx, query, subjectID)
	return err
}
