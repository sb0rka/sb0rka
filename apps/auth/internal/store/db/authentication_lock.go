package db

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Serialize password proofs and session issuance before taking request/session/token locks.
func lockAuthenticationUser(ctx context.Context, tx pgx.Tx, userID uuid.UUID) (string, error) {
	var hash string
	err := tx.QueryRow(ctx, `SELECT password_hash FROM user_principals WHERE id=$1 AND is_active FOR UPDATE`, userID).Scan(&hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrUserNotFound
	}
	return hash, err
}

func lockAuthenticationSession(ctx context.Context, tx pgx.Tx, sessionID, userID uuid.UUID) error {
	var id uuid.UUID
	err := tx.QueryRow(ctx, `SELECT id FROM auth_sessions WHERE id=$1 AND subject_id=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE`, sessionID, userID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrTokenExpired
	}
	return err
}

// Revocation also serializes on inactive users, whose remaining rows may need cleanup.
func lockRevocationUser(ctx context.Context, tx pgx.Tx, userID uuid.UUID) error {
	var id uuid.UUID
	err := tx.QueryRow(ctx, `SELECT id FROM user_principals WHERE id=$1 FOR UPDATE`, userID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	return err
}
