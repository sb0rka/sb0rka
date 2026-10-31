package db

import (
	"context"
	"errors"
	"time"

	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// CreateAuthSession creates a session after login
func (p *PsqlDB) CreateAuthSession(ctx context.Context, sessionID uuid.UUID, subjectID, familyID uuid.UUID, refreshTokenHash, createdIP string, createdUserAgent *string, expiresAt time.Time) (model.AuthSession, error) {
	const query = `
		INSERT INTO auth_sessions (id, subject_id, family_id, refresh_token_hash, created_ip, created_user_agent, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING id, subject_id, (SELECT kind FROM subjects WHERE subjects.id = auth_sessions.subject_id), family_id, oauth_client_id, refresh_token_hash, created_ip, created_user_agent, revoke_reason, revoked_at, created_at, expires_at, replaced_by
	`
	var as model.AuthSession
	err := p.pool.QueryRow(ctx, query, sessionID, subjectID, familyID, refreshTokenHash, createdIP, createdUserAgent, expiresAt).Scan(
		&as.ID, &as.SubjectID, &as.SubjectKind, &as.FamilyID, &as.OAuthClientID, &as.RefreshTokenHash, &as.CreatedIP, &as.CreatedUserAgent,
		&as.RevokeReason, &as.RevokedAt, &as.CreatedAt, &as.ExpiresAt, &as.ReplacedBy,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.AuthSession{}, ErrUnexpectedEmptyReturn
		}

		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			// subject_id references subjects(id) foreign_key_violation
			if pgErr.Code == "23503" {
				return model.AuthSession{}, ErrUserNotFound
			}
		}

		return model.AuthSession{}, err
	}
	return as, nil
}

func (p *PsqlDB) GetAuthSession(ctx context.Context, sessionID uuid.UUID) (model.AuthSession, error) {
	const query = `
			SELECT a.id, a.subject_id, s.kind, a.family_id, a.oauth_client_id, a.refresh_token_hash, a.created_ip, a.created_user_agent, a.revoke_reason, a.revoked_at, a.created_at, a.expires_at, a.replaced_by
		FROM auth_sessions a
		JOIN subjects s ON s.id = a.subject_id
		WHERE a.id = $1
	`

	var as model.AuthSession
	err := p.pool.QueryRow(ctx, query, sessionID).Scan(
		&as.ID, &as.SubjectID, &as.SubjectKind, &as.FamilyID, &as.OAuthClientID, &as.RefreshTokenHash, &as.CreatedIP, &as.CreatedUserAgent,
		&as.RevokeReason, &as.RevokedAt, &as.CreatedAt, &as.ExpiresAt, &as.ReplacedBy,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.AuthSession{}, ErrTokenNotFound
		}
		return model.AuthSession{}, err
	}
	return as, nil
}

// ResolveBrowserSession resolves a current refresh cookie without rotating or
// otherwise mutating its session family. The recursive leg walks predecessor
// rows so authentication time remains stable across refresh rotations.
func (p *PsqlDB) ResolveBrowserSession(ctx context.Context, refreshTokenHash string) (model.BrowserSession, error) {
	// Each refresh inserts a new auth_sessions row and links the old one via
	// replaced_by, so the live cookie's created_at is the last rotation, not
	// the login. Walk predecessors in the same family and take MIN(created_at)
	// for a stable OIDC auth_time; keep returning the current session id.
	const query = `
		WITH RECURSIVE session_family AS (
			SELECT
				a.id AS current_session_id,
				a.id,
				a.subject_id,
				a.family_id,
				a.created_at
			FROM auth_sessions a
			JOIN subjects s ON s.id = a.subject_id
			JOIN users u ON u.id = a.subject_id
				WHERE a.refresh_token_hash = $1
					AND a.revoked_at IS NULL
					AND a.expires_at > NOW()
					AND a.oauth_client_id IS NULL
				AND s.kind = 'user'
				AND u.is_active = true

			UNION

			SELECT
				family.current_session_id,
				previous.id,
				previous.subject_id,
				previous.family_id,
				previous.created_at
			FROM auth_sessions previous
			JOIN session_family family
				ON previous.replaced_by = family.id
				AND previous.family_id = family.family_id
				AND previous.subject_id = family.subject_id
		)
		SELECT current_session_id, subject_id, MIN(created_at)
		FROM session_family
		GROUP BY current_session_id, subject_id
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

func (p *PsqlDB) refreshAuthSession(ctx context.Context, oldRefreshTokenHash string, newSessionID uuid.UUID, newRefreshTokenHash, createdIP string, createdUserAgent *string, expiresAt time.Time, expectedOAuthClientID *string) (model.AuthSession, error) {
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return model.AuthSession{}, err
	}
	defer tx.Rollback(ctx)

	const selectForUpdateQuery = `
			SELECT a.id, a.subject_id, s.kind, a.family_id, a.oauth_client_id, a.refresh_token_hash, a.created_ip, a.created_user_agent, a.revoke_reason, a.revoked_at, a.created_at, a.expires_at, a.replaced_by
		FROM auth_sessions a
		JOIN subjects s ON s.id = a.subject_id
		WHERE a.refresh_token_hash = $1
		FOR UPDATE
	`

	var oldSession model.AuthSession
	err = tx.QueryRow(ctx, selectForUpdateQuery, oldRefreshTokenHash).Scan(
		&oldSession.ID, &oldSession.SubjectID, &oldSession.SubjectKind, &oldSession.FamilyID, &oldSession.OAuthClientID, &oldSession.RefreshTokenHash, &oldSession.CreatedIP, &oldSession.CreatedUserAgent,
		&oldSession.RevokeReason, &oldSession.RevokedAt, &oldSession.CreatedAt, &oldSession.ExpiresAt, &oldSession.ReplacedBy,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.AuthSession{}, ErrTokenNotFound
		}
		return model.AuthSession{}, err
	}
	if expectedOAuthClientID == nil {
		if oldSession.OAuthClientID != nil {
			return model.AuthSession{}, ErrTokenNotFound
		}
	} else if oldSession.OAuthClientID == nil || *oldSession.OAuthClientID != *expectedOAuthClientID {
		return model.AuthSession{}, ErrTokenNotFound
	}

	// Check if the session is revoked

	if oldSession.RevokedAt != nil {
		const revokeFamilyQuery = `
			UPDATE auth_sessions
			SET revoked_at = NOW(), revoke_reason = 'reuse_detected'
			WHERE family_id = $1 AND revoked_at IS NULL
		`
		if _, err = tx.Exec(ctx, revokeFamilyQuery, oldSession.FamilyID); err != nil {
			return model.AuthSession{}, err
		}
		if err = tx.Commit(ctx); err != nil {
			return model.AuthSession{}, err
		}
		return model.AuthSession{}, ErrTokenReuseDetected
	}

	// Check if the session is expired

	now := time.Now().UTC()
	if !oldSession.ExpiresAt.After(now) {
		const markExpiredQuery = `
			UPDATE auth_sessions
			SET revoked_at = NOW(), revoke_reason = 'expired'
			WHERE id = $1 AND revoked_at IS NULL
		`
		if _, err = tx.Exec(ctx, markExpiredQuery, oldSession.ID); err != nil {
			return model.AuthSession{}, err
		}
		if err = tx.Commit(ctx); err != nil {
			return model.AuthSession{}, err
		}
		return model.AuthSession{}, ErrTokenExpired
	}

	// Check if the user-backed subject is active

	const checkActiveUserQuery = `
		SELECT u.is_active
		FROM users u
		JOIN subjects s ON s.id = u.id
		WHERE u.id = $1
			AND s.kind = 'user'
	`
	var isUserActive bool
	err = tx.QueryRow(ctx, checkActiveUserQuery, oldSession.SubjectID).Scan(&isUserActive)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.AuthSession{}, ErrUserNotFound
		}
		return model.AuthSession{}, err
	}
	if !isUserActive {
		return model.AuthSession{}, ErrUserNotFound
	}

	// Step 1: Revoke the old session without setting replaced_by yet.
	// replaced_by references auth_sessions(id), so the new session must exist first.
	// Revoking here clears the unique partial index (family_id WHERE revoked_at IS NULL)
	// so the subsequent INSERT does not violate uq_auth_sess_family_active.

	const revokeRotatedQuery = `
		UPDATE auth_sessions
		SET revoked_at = NOW(), revoke_reason = 'rotated'
		WHERE id = $1 AND revoked_at IS NULL
	`
	tag, err := tx.Exec(ctx, revokeRotatedQuery, oldSession.ID)
	if err != nil {
		return model.AuthSession{}, err
	}
	if tag.RowsAffected() != 1 {
		return model.AuthSession{}, ErrTokenNotFound
	}

	// Step 2: Insert the new session. The family slot is now free.

	const createNewSessionQuery = `
			INSERT INTO auth_sessions (id, subject_id, family_id, oauth_client_id, refresh_token_hash, created_ip, created_user_agent, expires_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			RETURNING id, subject_id, (SELECT kind FROM subjects WHERE subjects.id = auth_sessions.subject_id), family_id, oauth_client_id, refresh_token_hash, created_ip, created_user_agent, revoke_reason, revoked_at, created_at, expires_at, replaced_by
	`
	var newSession model.AuthSession
	err = tx.QueryRow(ctx, createNewSessionQuery, newSessionID, oldSession.SubjectID, oldSession.FamilyID, oldSession.OAuthClientID, newRefreshTokenHash, createdIP, createdUserAgent, expiresAt).Scan(
		&newSession.ID, &newSession.SubjectID, &newSession.SubjectKind, &newSession.FamilyID, &newSession.OAuthClientID, &newSession.RefreshTokenHash, &newSession.CreatedIP, &newSession.CreatedUserAgent,
		&newSession.RevokeReason, &newSession.RevokedAt, &newSession.CreatedAt, &newSession.ExpiresAt, &newSession.ReplacedBy,
	)
	if err != nil {
		return model.AuthSession{}, err
	}

	// Step 3: Back-fill replaced_by on the old session now that the new row exists.

	const backfillReplacedByQuery = `
		UPDATE auth_sessions
		SET replaced_by = $2
		WHERE id = $1
	`
	if _, err = tx.Exec(ctx, backfillReplacedByQuery, oldSession.ID, newSessionID); err != nil {
		return model.AuthSession{}, err
	}

	if err = tx.Commit(ctx); err != nil {
		return model.AuthSession{}, err
	}

	return newSession, nil
}

func (p *PsqlDB) RevokeOAuthSessionFamily(ctx context.Context, refreshTokenHash, oauthClientID string) error {
	if oauthClientID == "" {
		return nil
	}
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var familyID uuid.UUID
	var boundClientID *string
	err = tx.QueryRow(ctx, `
		SELECT family_id, oauth_client_id
		FROM auth_sessions
		WHERE refresh_token_hash = $1
		FOR UPDATE
	`, refreshTokenHash).Scan(&familyID, &boundClientID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if boundClientID == nil || *boundClientID != oauthClientID {
		return nil
	}
	if _, err := tx.Exec(ctx, `
		UPDATE auth_sessions
		SET revoked_at = COALESCE(revoked_at, NOW()),
			revoke_reason = COALESCE(revoke_reason, 'oauth_client_revoke')
		WHERE family_id = $1
	`, familyID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (p *PsqlDB) ListAuthSessions(ctx context.Context, subjectID uuid.UUID) ([]model.AuthSession, error) {
	const query = `
			SELECT a.id, a.subject_id, s.kind, a.family_id, a.oauth_client_id, a.refresh_token_hash, a.created_ip, a.created_user_agent, a.revoke_reason, a.revoked_at, a.created_at, a.expires_at, a.replaced_by
		FROM auth_sessions a
		JOIN subjects s ON s.id = a.subject_id
		WHERE a.subject_id = $1
			AND a.revoked_at IS NULL
			AND a.expires_at > NOW()
		ORDER BY a.created_at DESC
	`

	rows, err := p.pool.Query(ctx, query, subjectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sessions := make([]model.AuthSession, 0)
	for rows.Next() {
		var as model.AuthSession
		if err := rows.Scan(
			&as.ID, &as.SubjectID, &as.SubjectKind, &as.FamilyID, &as.OAuthClientID, &as.RefreshTokenHash, &as.CreatedIP, &as.CreatedUserAgent,
			&as.RevokeReason, &as.RevokedAt, &as.CreatedAt, &as.ExpiresAt, &as.ReplacedBy,
		); err != nil {
			return nil, err
		}
		sessions = append(sessions, as)
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
	return err
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
