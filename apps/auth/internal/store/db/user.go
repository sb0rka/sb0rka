package db

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func (p *PsqlDB) CreateUser(ctx context.Context, userID uuid.UUID, isActive bool, username, email, passwordHash string, phone int, postInsert func(ctx context.Context, tx pgx.Tx) error) (model.User, error) {
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return model.User{}, err
	}
	defer tx.Rollback(ctx)

	const subjectQuery = `
		INSERT INTO subjects (id, kind)
		VALUES ($1, 'user')
	`
	if _, err := tx.Exec(ctx, subjectQuery, userID); err != nil {
		return model.User{}, err
	}

	const query = `
		INSERT INTO users (id, is_active, username, email, password_hash, phone)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6, 0))
		RETURNING id, is_active, username, email, phone, password_hash, created_at, updated_at
	`

	var user model.User
	err = tx.QueryRow(ctx, query, userID, isActive, username, email, passwordHash, phone).Scan(
		&user.ID,
		&user.IsActive,
		&user.Username,
		&user.Email,
		&user.Phone,
		&user.PasswordHash,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.User{}, ErrUnexpectedEmptyReturn
		}

		// Handle the username uniqueness error
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			if pgErr.Code == "23505" { // unique_violation
				return model.User{}, ErrUserAlreadyExists
			}
		}

		return model.User{}, err
	}

	if postInsert != nil {
		if err := postInsert(ctx, tx); err != nil {
			return model.User{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return model.User{}, err
	}

	return user, nil
}

func (p *PsqlDB) GetUser(ctx context.Context, userID, username, email string) (model.User, error) {
	const baseQuery = `
		SELECT id, is_active, username, email, phone, password_hash, created_at, updated_at
		FROM users
	`

	conditions := make([]string, 0, 3)
	args := make([]any, 0, 3)

	if userID != "" {
		args = append(args, userID)
		conditions = append(conditions, fmt.Sprintf("id = $%d", len(args)))
	}
	if username != "" {
		args = append(args, username)
		conditions = append(conditions, fmt.Sprintf("username = $%d", len(args)))
	}
	if email != "" {
		args = append(args, email)
		conditions = append(conditions, fmt.Sprintf("email = $%d", len(args)))
	}

	if len(conditions) == 0 {
		return model.User{}, fmt.Errorf("GetUser: at least one filter must be provided")
	}

	query := baseQuery + " WHERE " + strings.Join(conditions, " AND ") + " AND is_active = true"

	var user model.User
	err := p.pool.QueryRow(ctx, query, args...).Scan(
		&user.ID,
		&user.IsActive,
		&user.Username,
		&user.Email,
		&user.Phone,
		&user.PasswordHash,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.User{}, ErrUserNotFound
		}
		return model.User{}, err
	}

	return user, nil
}

func (p *PsqlDB) UpdateUser(ctx context.Context, userID uuid.UUID, username, email, phone string) (model.User, error) {
	phoneNumber := 0
	if strings.TrimSpace(phone) != "" {
		parsedPhone, err := strconv.Atoi(phone)
		if err != nil {
			return model.User{}, fmt.Errorf("failed to parse phone: %w", err)
		}
		phoneNumber = parsedPhone
	}

	const query = `
		UPDATE users
		SET username = $2, email = $3, phone = NULLIF($4, 0)
		WHERE id = $1 AND is_active = true
		RETURNING id, is_active, username, email, phone, password_hash, created_at, updated_at
	`

	var user model.User
	err := p.pool.QueryRow(ctx, query, userID, username, email, phoneNumber).Scan(
		&user.ID,
		&user.IsActive,
		&user.Username,
		&user.Email,
		&user.Phone,
		&user.PasswordHash,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.User{}, ErrUserNotFound
		}

		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			if pgErr.Code == "23505" { // unique_violation
				return model.User{}, ErrUserAlreadyExists
			}
		}

		return model.User{}, err
	}
	return user, nil
}

func (p *PsqlDB) UpdateUserPassword(ctx context.Context, userID uuid.UUID, passwordHash string) error {
	const query = `
		UPDATE users
		SET password_hash = $2
		WHERE id = $1 AND is_active = true
	`
	tag, err := p.pool.Exec(ctx, query, userID, passwordHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (p *PsqlDB) DeactivateUser(ctx context.Context, userID uuid.UUID) error {
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	const deactivateQuery = `
		UPDATE users
		SET is_active = false
		WHERE id = $1 AND is_active = true
	`
	tag, err := tx.Exec(ctx, deactivateQuery, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}

	const revokeSessionsQuery = `
		UPDATE auth_sessions
		SET revoked_at = NOW(), revoke_reason = 'user_deactivated'
		WHERE subject_id = $1 AND revoked_at IS NULL
	`
	if _, err := tx.Exec(ctx, revokeSessionsQuery, userID); err != nil {
		return err
	}

	return tx.Commit(ctx)
}
