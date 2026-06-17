package db

import (
	"context"
	"errors"

	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (p *PsqlDB) GetSubject(ctx context.Context, subjectID uuid.UUID) (model.Subject, error) {
	const query = `
		SELECT id, kind, created_at, updated_at
		FROM subjects
		WHERE id = $1
	`
	var s model.Subject
	err := p.pool.QueryRow(ctx, query, subjectID).Scan(
		&s.ID, &s.Kind, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Subject{}, ErrSubjectNotFound
		}
		return model.Subject{}, err
	}
	return s, nil
}
