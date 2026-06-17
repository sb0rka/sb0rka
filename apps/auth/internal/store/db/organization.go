package db

import (
	"context"
	"errors"

	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func (p *PsqlDB) CreateOrganization(ctx context.Context, orgID uuid.UUID, name string, description *string, ownerUserID uuid.UUID) (model.Organization, error) {
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return model.Organization{}, err
	}
	defer tx.Rollback(ctx)

	const checkOwnerQuery = `SELECT EXISTS (SELECT 1 FROM users WHERE id = $1 AND is_active = true)`
	var ownerActive bool
	if err := tx.QueryRow(ctx, checkOwnerQuery, ownerUserID).Scan(&ownerActive); err != nil {
		return model.Organization{}, err
	}
	if !ownerActive {
		return model.Organization{}, ErrUserNotFound
	}

	const subjectQuery = `INSERT INTO subjects (id, kind) VALUES ($1, 'organization')`
	if _, err := tx.Exec(ctx, subjectQuery, orgID); err != nil {
		return model.Organization{}, err
	}

	const orgQuery = `
		INSERT INTO organizations (id, name, description)
		VALUES ($1, $2, $3)
		RETURNING id, name, description, created_at, updated_at
	`
	var org model.Organization
	if err := tx.QueryRow(ctx, orgQuery, orgID, name, description).Scan(
		&org.ID, &org.Name, &org.Description, &org.CreatedAt, &org.UpdatedAt,
	); err != nil {
		return model.Organization{}, err
	}

	const memberQuery = `
		INSERT INTO organization_members (user_id, organization_id, role)
		VALUES ($1, $2, 'owner')
	`
	if _, err := tx.Exec(ctx, memberQuery, ownerUserID, orgID); err != nil {
		return model.Organization{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return model.Organization{}, err
	}
	return org, nil
}

func (p *PsqlDB) GetOrganization(ctx context.Context, orgID, memberUserID uuid.UUID) (model.Organization, error) {
	const query = `
		SELECT o.id, o.name, o.description, o.created_at, o.updated_at
		FROM organizations o
		JOIN organization_members m ON m.organization_id = o.id
		JOIN users u ON u.id = m.user_id AND u.is_active = true
		WHERE o.id = $1 AND m.user_id = $2
	`
	var org model.Organization
	err := p.pool.QueryRow(ctx, query, orgID, memberUserID).Scan(
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

func (p *PsqlDB) ListOrganizations(ctx context.Context, userID uuid.UUID) ([]model.Organization, error) {
	const query = `
		SELECT o.id, o.name, o.description, o.created_at, o.updated_at
		FROM organizations o
		JOIN organization_members m ON m.organization_id = o.id
		JOIN users u ON u.id = m.user_id AND u.is_active = true
		WHERE m.user_id = $1
		ORDER BY o.created_at DESC
	`
	rows, err := p.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	orgs := make([]model.Organization, 0)
	for rows.Next() {
		var org model.Organization
		if err := rows.Scan(&org.ID, &org.Name, &org.Description, &org.CreatedAt, &org.UpdatedAt); err != nil {
			return nil, err
		}
		orgs = append(orgs, org)
	}
	return orgs, rows.Err()
}

func (p *PsqlDB) UpdateOrganization(ctx context.Context, orgID, memberUserID uuid.UUID, name *string, description *string) (model.Organization, error) {
	const query = `
		UPDATE organizations o
		SET
			name = COALESCE($2, name),
			description = COALESCE($3, description)
		FROM organization_members m
		JOIN users u ON u.id = m.user_id AND u.is_active = true
		WHERE o.id = $1 AND m.organization_id = o.id AND m.user_id = $4
		RETURNING o.id, o.name, o.description, o.created_at, o.updated_at
	`
	var org model.Organization
	err := p.pool.QueryRow(ctx, query, orgID, name, description, memberUserID).Scan(
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

func (p *PsqlDB) DeleteOrganization(ctx context.Context, orgID, memberUserID uuid.UUID) error {
	const query = `
		DELETE FROM subjects s
		WHERE s.id = $1
			AND s.kind = 'organization'
			AND EXISTS (
				SELECT 1
				FROM organization_members m
				JOIN users u ON u.id = m.user_id AND u.is_active = true
				WHERE m.organization_id = s.id AND m.user_id = $2
			)
	`
	tag, err := p.pool.Exec(ctx, query, orgID, memberUserID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrOrganizationNotFound
	}
	return nil
}

func (p *PsqlDB) ListOrganizationMembers(ctx context.Context, orgID, memberUserID uuid.UUID) ([]model.OrganizationMember, error) {
	const query = `
		SELECT m.user_id, m.organization_id, m.role, m.created_at, m.updated_at
		FROM organization_members m
		JOIN organization_members caller ON caller.organization_id = m.organization_id
		JOIN users u ON u.id = caller.user_id AND u.is_active = true
		WHERE m.organization_id = $1 AND caller.user_id = $2
		ORDER BY m.created_at
	`
	rows, err := p.pool.Query(ctx, query, orgID, memberUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := make([]model.OrganizationMember, 0)
	for rows.Next() {
		var m model.OrganizationMember
		if err := rows.Scan(&m.UserID, &m.OrganizationID, &m.Role, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, rows.Err()
}

func (p *PsqlDB) AddOrganizationMember(ctx context.Context, orgID, userID, memberUserID uuid.UUID, role string) (model.OrganizationMember, error) {
	const query = `
		INSERT INTO organization_members (user_id, organization_id, role)
		SELECT target.id, $2, $3
		FROM users target
		JOIN organization_members caller ON caller.organization_id = $2 AND caller.user_id = $4
		JOIN users caller_user ON caller_user.id = caller.user_id AND caller_user.is_active = true
		WHERE target.id = $1 AND target.is_active = true
		RETURNING user_id, organization_id, role, created_at, updated_at
	`
	var m model.OrganizationMember
	err := p.pool.QueryRow(ctx, query, userID, orgID, role, memberUserID).Scan(
		&m.UserID, &m.OrganizationID, &m.Role, &m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// No row: either the target user does not exist or is inactive
			return model.OrganizationMember{}, ErrUserNotFound
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			switch pgErr.Code {
			case "23505": // unique_violation
				return model.OrganizationMember{}, ErrOrganizationMemberAlreadyExists
			case "23503": // foreign_key_violation (org does not exist)
				return model.OrganizationMember{}, ErrUserNotFound
			}
		}
		return model.OrganizationMember{}, err
	}
	return m, nil
}

func (p *PsqlDB) GetOrganizationMember(ctx context.Context, orgID, userID, memberUserID uuid.UUID) (model.OrganizationMember, error) {
	const query = `
		SELECT m.user_id, m.organization_id, m.role, m.created_at, m.updated_at
		FROM organization_members m
		JOIN users target_user ON target_user.id = m.user_id AND target_user.is_active = true
		JOIN organization_members caller ON caller.organization_id = m.organization_id
		JOIN users caller_user ON caller_user.id = caller.user_id AND caller_user.is_active = true
		WHERE m.user_id = $1 AND m.organization_id = $2 AND caller.user_id = $3
	`
	var m model.OrganizationMember
	err := p.pool.QueryRow(ctx, query, userID, orgID, memberUserID).Scan(
		&m.UserID, &m.OrganizationID, &m.Role, &m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.OrganizationMember{}, ErrOrganizationMemberNotFound
		}
		return model.OrganizationMember{}, err
	}
	return m, nil
}

func (p *PsqlDB) UpdateOrganizationMemberRole(ctx context.Context, orgID, userID, memberUserID uuid.UUID, role string) (model.OrganizationMember, error) {
	const query = `
		UPDATE organization_members m
		SET role = $3
		FROM organization_members caller
		JOIN users u ON u.id = caller.user_id AND u.is_active = true
		WHERE m.user_id = $1
			AND m.organization_id = $2
			AND caller.organization_id = m.organization_id
			AND caller.user_id = $4
		RETURNING m.user_id, m.organization_id, m.role, m.created_at, m.updated_at
	`
	var m model.OrganizationMember
	err := p.pool.QueryRow(ctx, query, userID, orgID, role, memberUserID).Scan(
		&m.UserID, &m.OrganizationID, &m.Role, &m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.OrganizationMember{}, ErrOrganizationMemberNotFound
		}
		return model.OrganizationMember{}, err
	}
	return m, nil
}

func (p *PsqlDB) RemoveOrganizationMember(ctx context.Context, orgID, userID, memberUserID uuid.UUID) error {
	const query = `
		DELETE FROM organization_members m
		USING organization_members caller
		JOIN users u ON u.id = caller.user_id AND u.is_active = true
		WHERE m.user_id = $1
			AND m.organization_id = $2
			AND caller.organization_id = m.organization_id
			AND caller.user_id = $3
	`
	tag, err := p.pool.Exec(ctx, query, userID, orgID, memberUserID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrOrganizationMemberNotFound
	}
	return nil
}
