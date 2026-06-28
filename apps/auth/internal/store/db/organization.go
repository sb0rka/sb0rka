package db

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"
)

// GetOrganizationByID reads an organization by id, ignoring membership. Used by
// auth subject resolution; organization management lives in the internal module.
func (p *PsqlDB) GetOrganizationByID(ctx context.Context, orgID uuid.UUID) (model.Organization, error) {
	const query = `
		SELECT id, name, description, created_at, updated_at
		FROM organizations
		WHERE id = $1
	`
	var org model.Organization
	err := p.pool.QueryRow(ctx, query, orgID).Scan(
		&org.ID, &org.Name, &org.Description, &org.CreatedAt, &org.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Organization{}, ErrOrganizationNotFound
		}
		return model.Organization{}, err
	}
	return org, nil
}
