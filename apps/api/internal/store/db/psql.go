package db

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/sb0rka/sb0rka/apps/api/internal/domain/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PsqlDB struct {
	pool *pgxpool.Pool
}

// DatabasePasswordSecretName returns the generated secret name for a database password.
func DatabasePasswordSecretName(databaseResourceID string) string {
	return fmt.Sprintf("DATABASE_%s_PASSWORD", databaseResourceID)
}

// DatabasePasswordSecretDescription returns the generated secret description for a database password.
func DatabasePasswordSecretDescription(databaseName string, databaseResourceID string) string {
	return fmt.Sprintf("Password for database %s with ID %s", databaseName, databaseResourceID)
}

// DatabaseSecretTag returns the system tag that links a database to its password secret.
func DatabaseSecretTag(databaseResourceID string, secretResourceID string) (string, string) {
	return "db_secret", fmt.Sprintf("%s_%s", databaseResourceID, secretResourceID)
}

func NewPsqlDB(uri string, maxConns int, connMaxLifetime time.Duration) (*PsqlDB, error) {
	pool, err := pgxpool.New(context.Background(), uri)
	if err != nil {
		return nil, err
	}

	pool.Config().MaxConns = int32(maxConns)
	pool.Config().MaxConnLifetime = connMaxLifetime

	return &PsqlDB{pool: pool}, nil
}

func (p *PsqlDB) TestConnection(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return p.pool.Ping(ctx)
}

func (p *PsqlDB) Close() error {
	if p.pool != nil {
		p.pool.Close()
	}
	return nil
}

func (p *PsqlDB) GenerateResourceID(ctx context.Context) (string, error) {
	const query = `SELECT gen_resource_id()`
	var id string
	if err := p.pool.QueryRow(ctx, query).Scan(&id); err != nil {
		return "", err
	}
	return id, nil
}

func (p *PsqlDB) GetSubjectKind(ctx context.Context, subjectID uuid.UUID) (string, error) {
	const query = `SELECT kind FROM auth.subjects WHERE id = $1`
	var kind string
	if err := p.pool.QueryRow(ctx, query, subjectID).Scan(&kind); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrSubjectNotFound
		}
		return "", err
	}
	return kind, nil
}

func (p *PsqlDB) IsLiveSession(ctx context.Context, sessionID uuid.UUID, subjectID uuid.UUID) (bool, error) {
	const query = `SELECT auth.is_live_session($1, $2)`
	var ok bool
	if err := p.pool.QueryRow(ctx, query, sessionID, subjectID).Scan(&ok); err != nil {
		return false, err
	}
	return ok, nil
}

func (p *PsqlDB) GetSubjectPlan(ctx context.Context, subjectID uuid.UUID) (model.Plan, error) {
	const query = `
		SELECT p.id, p.name, p.description, p.code, p.kind, p.is_public, p.is_available, p.created_at, p.updated_at
		FROM subject_plans sp
		INNER JOIN plans p ON p.id = sp.plan_id
		WHERE sp.subject_id = $1
		ORDER BY sp.updated_at DESC
		LIMIT 1
	`
	var out model.Plan
	if err := p.pool.QueryRow(ctx, query, subjectID).Scan(
		&out.ID,
		&out.Name,
		&out.Description,
		&out.Code,
		&out.Kind,
		&out.IsPublic,
		&out.IsAvailable,
		&out.CreatedAt,
		&out.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Plan{}, ErrSubjectPlanNotFound
		}
		return model.Plan{}, err
	}
	return out, nil
}

func (p *PsqlDB) GetSubjectPlanByKind(ctx context.Context, subjectID uuid.UUID, kind string) (model.Plan, error) {
	const query = `
		SELECT p.id, p.name, p.description, p.code, p.kind, p.is_public, p.is_available, p.created_at, p.updated_at
		FROM subject_plans sp
		INNER JOIN plans p ON p.id = sp.plan_id
		WHERE sp.subject_id = $1
		  AND p.kind = $2
		ORDER BY sp.updated_at DESC
		LIMIT 1
	`
	var out model.Plan
	if err := p.pool.QueryRow(ctx, query, subjectID, kind).Scan(
		&out.ID,
		&out.Name,
		&out.Description,
		&out.Code,
		&out.Kind,
		&out.IsPublic,
		&out.IsAvailable,
		&out.CreatedAt,
		&out.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Plan{}, ErrSubjectPlanNotFound
		}
		return model.Plan{}, err
	}
	return out, nil
}

func (p *PsqlDB) EnsureSubjectPlan(ctx context.Context, subjectID uuid.UUID, planCode string, kind string) error {
	const existingQuery = `
		SELECT 1
		FROM subject_plans sp
		INNER JOIN plans p ON p.id = sp.plan_id
		WHERE sp.subject_id = $1
		  AND p.kind = $2
		LIMIT 1
	`
	var existing int
	if err := p.pool.QueryRow(ctx, existingQuery, subjectID, kind).Scan(&existing); err == nil {
		return nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	planID, err := p.getPlanIDByCodeAndKind(ctx, planCode, kind)
	if err != nil {
		return err
	}

	const insertQuery = `
		INSERT INTO subject_plans (subject_id, plan_id)
		VALUES ($1, $2)
	`
	if _, err := p.pool.Exec(ctx, insertQuery, subjectID, planID); err != nil {
		return err
	}

	return nil
}

func (p *PsqlDB) GetProjectPlan(ctx context.Context, projectID string) (model.Plan, error) {
	const query = `
		SELECT p.id, p.name, p.description, p.code, p.kind, p.is_public, p.is_available, p.created_at, p.updated_at
		FROM projects pr
		INNER JOIN plans p ON p.id = pr.plan_id
		WHERE pr.id = $1
	`
	var out model.Plan
	if err := p.pool.QueryRow(ctx, query, projectID).Scan(
		&out.ID,
		&out.Name,
		&out.Description,
		&out.Code,
		&out.Kind,
		&out.IsPublic,
		&out.IsAvailable,
		&out.CreatedAt,
		&out.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Plan{}, ErrProjectNotFound
		}
		return model.Plan{}, err
	}
	return out, nil
}

func (p *PsqlDB) ListPublicPlans(ctx context.Context) ([]model.Plan, error) {
	const query = `
		SELECT id, name, description, code, kind, is_public, is_available, created_at, updated_at
		FROM plans
		WHERE is_public = true AND is_available = true
		ORDER BY kind, name
	`
	rows, err := p.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.Plan, 0)
	for rows.Next() {
		var plan model.Plan
		if err := rows.Scan(
			&plan.ID,
			&plan.Name,
			&plan.Description,
			&plan.Code,
			&plan.Kind,
			&plan.IsPublic,
			&plan.IsAvailable,
			&plan.CreatedAt,
			&plan.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, plan)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (p *PsqlDB) ListProjectQuotas(ctx context.Context, projectID string) ([]model.ProjectQuota, error) {
	const query = `
		SELECT
			pq.plan_id,
			pq.limit_value,
			pq.created_at,
			pq.updated_at,
			qd.id,
			qd.name,
			qd.description,
			qd.code,
			qd.scope,
			qd.unit,
			qd.created_at,
			qd.updated_at
		FROM projects pr
		INNER JOIN plan_quotas pq ON pq.plan_id = pr.plan_id
		INNER JOIN quota_definitions qd ON qd.id = pq.quota_definition_id
		WHERE pr.id = $1
		  AND qd.scope = 'project'
		ORDER BY qd.code
	`
	rows, err := p.pool.Query(ctx, query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.ProjectQuota, 0)
	for rows.Next() {
		var row model.ProjectQuota
		if err := rows.Scan(
			&row.PlanID,
			&row.LimitValue,
			&row.CreatedAt,
			&row.UpdatedAt,
			&row.Definition.ID,
			&row.Definition.Name,
			&row.Definition.Description,
			&row.Definition.Code,
			&row.Definition.Scope,
			&row.Definition.Unit,
			&row.Definition.CreatedAt,
			&row.Definition.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (p *PsqlDB) ListProjectUsage(ctx context.Context, projectID string) (map[string]int64, error) {
	const query = `
		SELECT kind, COUNT(*)
		FROM resources
		WHERE project_id = $1
		GROUP BY kind
	`
	rows, err := p.pool.Query(ctx, query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]int64{
		"databases.count": 0,
		"secrets.count":   0,
	}
	for rows.Next() {
		var kind string
		var count int64
		if err := rows.Scan(&kind, &count); err != nil {
			return nil, err
		}
		switch kind {
		case model.ResourceKindDatabase:
			out["databases.count"] = count
		case model.ResourceKindSecret:
			out["secrets.count"] = count
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (p *PsqlDB) AssertCanCreateProject(ctx context.Context, billingSubjectID uuid.UUID, planID *uuid.UUID) error {
	// Subject must have account plan.
	if _, err := p.GetSubjectPlanByKind(ctx, billingSubjectID, model.PlanKindAccount); err != nil {
		if errors.Is(err, ErrSubjectPlanNotFound) {
			return ErrSubjectPlanNotFound
		}
		return err
	}

	projectPlanID := planID
	if projectPlanID == nil {
		// Default project plan for newly created projects.
		id, err := p.getProjectPlanIDByCode(ctx, model.PlanCodeFreeProject)
		if err != nil {
			return err
		}
		projectPlanID = &id
	}

	const projectPlanCheck = `
		SELECT kind, is_available
		FROM plans
		WHERE id = $1
	`
	var kind string
	var isAvailable bool
	if err := p.pool.QueryRow(ctx, projectPlanCheck, *projectPlanID).Scan(&kind, &isAvailable); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrPlanNotFound
		}
		return err
	}
	if kind != model.PlanKindProject {
		return ErrInvalidPlanKind
	}
	if !isAvailable {
		return ErrPlanUnavailable
	}

	limit, err := p.getSubjectQuotaLimit(ctx, billingSubjectID, "projects.count")
	if err != nil {
		return err
	}
	if limit <= 0 {
		return nil
	}

	const countQuery = `SELECT COUNT(*) FROM projects WHERE billing_subject_id = $1`
	var count int64
	if err := p.pool.QueryRow(ctx, countQuery, billingSubjectID).Scan(&count); err != nil {
		return err
	}
	if count >= limit {
		return ErrProjectLimitReached
	}
	return nil
}

func (p *PsqlDB) getPlanIDByCodeAndKind(ctx context.Context, code string, kind string) (uuid.UUID, error) {
	const query = `
		SELECT id
		FROM plans
		WHERE code = $1
		  AND kind = $2
		  AND is_available = true
	`
	var id uuid.UUID
	if err := p.pool.QueryRow(ctx, query, code, kind).Scan(&id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, ErrPlanNotFound
		}
		return uuid.Nil, err
	}
	return id, nil
}

func (p *PsqlDB) getProjectPlanIDByCode(ctx context.Context, code string) (uuid.UUID, error) {
	return p.getPlanIDByCodeAndKind(ctx, code, model.PlanKindProject)
}

func (p *PsqlDB) AssertCanCreateResourceWithType(ctx context.Context, billingSubjectID uuid.UUID, projectID string, kind string) error {
	var projectKindQuotaCode string
	var accountQuotaCode string
	switch kind {
	case model.ResourceKindDatabase:
		projectKindQuotaCode = "databases.count"
		accountQuotaCode = "total.databases.count"
	case model.ResourceKindSecret:
		projectKindQuotaCode = "secrets.count"
		accountQuotaCode = "total.secrets.count"
	default:
		return ErrInvalidResourceKind
	}

	projectLimit, err := p.getProjectQuotaLimit(ctx, projectID, projectKindQuotaCode)
	if err != nil {
		if errors.Is(err, ErrProjectNotFound) {
			return ErrProjectNotFound
		}
		return err
	}
	if projectLimit > 0 {
		const projectCountQuery = `SELECT COUNT(*) FROM resources WHERE project_id = $1 AND kind = $2`
		var count int64
		if err := p.pool.QueryRow(ctx, projectCountQuery, projectID, kind).Scan(&count); err != nil {
			return err
		}
		if count >= projectLimit {
			return ErrResourceLimitReached
		}
	}

	accountLimit, err := p.getSubjectQuotaLimit(ctx, billingSubjectID, accountQuotaCode)
	if err != nil {
		return err
	}
	if accountLimit > 0 {
		const accountCountQuery = `
			SELECT COUNT(*)
			FROM resources r
			INNER JOIN projects p ON p.id = r.project_id
			WHERE p.billing_subject_id = $1
			  AND r.kind = $2
		`
		var count int64
		if err := p.pool.QueryRow(ctx, accountCountQuery, billingSubjectID, kind).Scan(&count); err != nil {
			return err
		}
		if count >= accountLimit {
			return ErrResourceLimitReached
		}
	}

	return nil
}

func (p *PsqlDB) getSubjectQuotaLimit(ctx context.Context, subjectID uuid.UUID, code string) (int64, error) {
	const query = `
		SELECT pq.limit_value
		FROM subject_plans sp
		INNER JOIN plan_quotas pq ON pq.plan_id = sp.plan_id
		INNER JOIN quota_definitions qd ON qd.id = pq.quota_definition_id
		WHERE sp.subject_id = $1
		  AND qd.code = $2
		ORDER BY pq.limit_value DESC
		LIMIT 1
	`
	var limit int64
	err := p.pool.QueryRow(ctx, query, subjectID, code).Scan(&limit)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, nil
		}
		return 0, err
	}
	return limit, nil
}

func (p *PsqlDB) getProjectQuotaLimit(ctx context.Context, projectID string, code string) (int64, error) {
	const query = `
		SELECT pq.limit_value
		FROM projects pr
		INNER JOIN plan_quotas pq ON pq.plan_id = pr.plan_id
		INNER JOIN quota_definitions qd ON qd.id = pq.quota_definition_id
		WHERE pr.id = $1
		  AND qd.code = $2
		ORDER BY pq.limit_value DESC
		LIMIT 1
	`
	var limit int64
	err := p.pool.QueryRow(ctx, query, projectID, code).Scan(&limit)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Differentiate between project missing and quota absent.
			const projectExistsQuery = `SELECT EXISTS(SELECT 1 FROM projects WHERE id = $1)`
			var exists bool
			if err := p.pool.QueryRow(ctx, projectExistsQuery, projectID).Scan(&exists); err != nil {
				return 0, err
			}
			if !exists {
				return 0, ErrProjectNotFound
			}
			return 0, nil
		}
		return 0, err
	}
	return limit, nil
}

func (p *PsqlDB) CreateProject(ctx context.Context, ownerSubjectID uuid.UUID, billingSubjectID uuid.UUID, name string, description *string) (model.Project, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.Project{}, err
	}
	defer tx.Rollback(ctx)

	// Default project plan for newly created projects.
	resolvedPlanID, err := p.getProjectPlanIDByCode(ctx, model.PlanCodeFreeProject)
	if err != nil {
		return model.Project{}, err
	}

	const insertProjectQuery = `
		INSERT INTO projects (plan_id, owner_subject_id, billing_subject_id, name, description, is_active)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, owner_subject_id, billing_subject_id, plan_id, name, description, is_active, created_at, updated_at
	`
	var project model.Project
	if err := tx.QueryRow(ctx, insertProjectQuery, resolvedPlanID, ownerSubjectID, billingSubjectID, name, description, true).Scan(
		&project.ID,
		&project.OwnerSubjectID,
		&project.BillingSubjectID,
		&project.PlanID,
		&project.Name,
		&project.Description,
		&project.IsActive,
		&project.CreatedAt,
		&project.UpdatedAt,
	); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return model.Project{}, ErrProjectAlreadyExists
		}
		return model.Project{}, err
	}

	const insertOwnerMemberQuery = `
		INSERT INTO project_members (project_id, subject_id, role)
		VALUES ($1, $2, $3)
	`
	if _, err := tx.Exec(ctx, insertOwnerMemberQuery, project.ID, ownerSubjectID, model.PrjMemberRoleOwner); err != nil {
		return model.Project{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return model.Project{}, err
	}
	return project, nil
}

func (p *PsqlDB) GetProject(ctx context.Context, id string) (model.Project, error) {
	const query = `
		SELECT id, owner_subject_id, billing_subject_id, plan_id, name, description, is_active, created_at, updated_at
		FROM projects
		WHERE id = $1
	`
	var project model.Project
	if err := p.pool.QueryRow(ctx, query, id).Scan(
		&project.ID,
		&project.OwnerSubjectID,
		&project.BillingSubjectID,
		&project.PlanID,
		&project.Name,
		&project.Description,
		&project.IsActive,
		&project.CreatedAt,
		&project.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Project{}, ErrProjectNotFound
		}
		return model.Project{}, err
	}
	return project, nil
}

func (p *PsqlDB) ListProjectsBySubject(ctx context.Context, subjectID uuid.UUID) ([]model.Project, error) {
	const query = `
		SELECT pr.id, pr.owner_subject_id, pr.billing_subject_id, pr.plan_id, pr.name, pr.description, pr.is_active, pr.created_at, pr.updated_at
		FROM project_members pm
		INNER JOIN projects pr ON pr.id = pm.project_id
		WHERE pm.subject_id = $1
		ORDER BY pr.created_at DESC
	`
	rows, err := p.pool.Query(ctx, query, subjectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.Project, 0)
	for rows.Next() {
		var project model.Project
		if err := rows.Scan(
			&project.ID,
			&project.OwnerSubjectID,
			&project.BillingSubjectID,
			&project.PlanID,
			&project.Name,
			&project.Description,
			&project.IsActive,
			&project.CreatedAt,
			&project.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, project)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (p *PsqlDB) UpdateProject(ctx context.Context, id string, name *string, description *string) (model.Project, error) {
	const query = `
		UPDATE projects
		SET
			name = COALESCE($2, name),
			description = COALESCE($3, description),
			updated_at = NOW()
		WHERE id = $1
		RETURNING id, owner_subject_id, billing_subject_id, plan_id, name, description, is_active, created_at, updated_at
	`
	var project model.Project
	if err := p.pool.QueryRow(ctx, query, id, name, description).Scan(
		&project.ID,
		&project.OwnerSubjectID,
		&project.BillingSubjectID,
		&project.PlanID,
		&project.Name,
		&project.Description,
		&project.IsActive,
		&project.CreatedAt,
		&project.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Project{}, ErrProjectNotFound
		}
		return model.Project{}, err
	}
	return project, nil
}

func (p *PsqlDB) DeleteProject(ctx context.Context, id string) error {
	const query = `DELETE FROM projects WHERE id = $1`
	cmd, err := p.pool.Exec(ctx, query, id)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrProjectNotFound
	}
	return nil
}

func (p *PsqlDB) GetProjectMember(ctx context.Context, projectID string, subjectID uuid.UUID) (model.ProjectMember, error) {
	const query = `
		SELECT project_id, subject_id, role, created_at, updated_at
		FROM project_members
		WHERE project_id = $1 AND subject_id = $2
	`
	var out model.ProjectMember
	if err := p.pool.QueryRow(ctx, query, projectID, subjectID).Scan(
		&out.ProjectID,
		&out.SubjectID,
		&out.Role,
		&out.CreatedAt,
		&out.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.ProjectMember{}, ErrProjectMemberNotFound
		}
		return model.ProjectMember{}, err
	}
	return out, nil
}

func (p *PsqlDB) ListProjectMembers(ctx context.Context, projectID string) ([]model.ProjectMember, error) {
	const query = `
		SELECT project_id, subject_id, role, created_at, updated_at
		FROM project_members
		WHERE project_id = $1
		ORDER BY role DESC, created_at ASC
	`
	rows, err := p.pool.Query(ctx, query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.ProjectMember, 0)
	for rows.Next() {
		var m model.ProjectMember
		if err := rows.Scan(&m.ProjectID, &m.SubjectID, &m.Role, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (p *PsqlDB) AddProjectMember(ctx context.Context, projectID string, subjectID uuid.UUID, role string) (model.ProjectMember, error) {
	kind, err := p.GetSubjectKind(ctx, subjectID)
	if err != nil {
		return model.ProjectMember{}, err
	}
	if kind != "user" {
		return model.ProjectMember{}, ErrSubjectKindMismatch
	}

	const query = `
		INSERT INTO project_members (project_id, subject_id, role)
		VALUES ($1, $2, $3)
		RETURNING project_id, subject_id, role, created_at, updated_at
	`
	var out model.ProjectMember
	if err := p.pool.QueryRow(ctx, query, projectID, subjectID, role).Scan(
		&out.ProjectID,
		&out.SubjectID,
		&out.Role,
		&out.CreatedAt,
		&out.UpdatedAt,
	); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return model.ProjectMember{}, ErrProjectMemberExists
		}
		return model.ProjectMember{}, err
	}
	return out, nil
}

func (p *PsqlDB) UpdateProjectMemberRole(ctx context.Context, projectID string, subjectID uuid.UUID, role string) (model.ProjectMember, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.ProjectMember{}, err
	}
	defer tx.Rollback(ctx)

	if err := lockProjectForOwnerInvariant(ctx, tx, projectID); err != nil {
		return model.ProjectMember{}, err
	}

	currentRole, err := getProjectMemberRoleForUpdate(ctx, tx, projectID, subjectID)
	if err != nil {
		return model.ProjectMember{}, err
	}
	if currentRole == model.PrjMemberRoleOwner && role != model.PrjMemberRoleOwner {
		ownerCount, err := countProjectOwners(ctx, tx, projectID)
		if err != nil {
			return model.ProjectMember{}, err
		}
		if ownerCount <= 1 {
			return model.ProjectMember{}, ErrLastOwner
		}
	}

	const query = `
		UPDATE project_members
		SET role = $3, updated_at = NOW()
		WHERE project_id = $1 AND subject_id = $2
		RETURNING project_id, subject_id, role, created_at, updated_at
	`
	var out model.ProjectMember
	if err := tx.QueryRow(ctx, query, projectID, subjectID, role).Scan(
		&out.ProjectID,
		&out.SubjectID,
		&out.Role,
		&out.CreatedAt,
		&out.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.ProjectMember{}, ErrProjectMemberNotFound
		}
		return model.ProjectMember{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return model.ProjectMember{}, err
	}
	return out, nil
}

func (p *PsqlDB) RemoveProjectMember(ctx context.Context, projectID string, subjectID uuid.UUID) error {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if err := lockProjectForOwnerInvariant(ctx, tx, projectID); err != nil {
		return err
	}

	currentRole, err := getProjectMemberRoleForUpdate(ctx, tx, projectID, subjectID)
	if err != nil {
		return err
	}
	if currentRole == model.PrjMemberRoleOwner {
		ownerCount, err := countProjectOwners(ctx, tx, projectID)
		if err != nil {
			return err
		}
		if ownerCount <= 1 {
			return ErrLastOwner
		}
	}

	const query = `DELETE FROM project_members WHERE project_id = $1 AND subject_id = $2`
	cmd, err := tx.Exec(ctx, query, projectID, subjectID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrProjectMemberNotFound
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	return nil
}

type txQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func lockProjectForOwnerInvariant(ctx context.Context, q txQuerier, projectID string) error {
	const query = `SELECT id FROM projects WHERE id = $1 FOR UPDATE`
	var id string
	if err := q.QueryRow(ctx, query, projectID).Scan(&id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrProjectNotFound
		}
		return err
	}
	return nil
}

func getProjectMemberRoleForUpdate(ctx context.Context, q txQuerier, projectID string, subjectID uuid.UUID) (string, error) {
	const query = `
		SELECT role
		FROM project_members
		WHERE project_id = $1 AND subject_id = $2
		FOR UPDATE
	`
	var role string
	if err := q.QueryRow(ctx, query, projectID, subjectID).Scan(&role); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrProjectMemberNotFound
		}
		return "", err
	}
	return role, nil
}

func countProjectOwners(ctx context.Context, q txQuerier, projectID string) (int, error) {
	const query = `
		SELECT COUNT(*)
		FROM project_members
		WHERE project_id = $1 AND role = 'owner'
	`
	var count int
	if err := q.QueryRow(ctx, query, projectID).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func (p *PsqlDB) ListResources(ctx context.Context, projectID string) ([]model.Resource, error) {
	const query = `
		SELECT
			r.id,
			r.project_id,
			r.kind,
			r.created_at,
			r.updated_at,
			rs.runtime_state,
			rs.created_at,
			rs.updated_at
		FROM resources r
		LEFT JOIN resource_states rs ON rs.resource_id = r.id
		WHERE r.project_id = $1
		ORDER BY r.created_at DESC
	`
	rows, err := p.pool.Query(ctx, query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.Resource, 0)
	for rows.Next() {
		var res model.Resource
		var runtimeState *string
		var stateCreatedAt *time.Time
		var stateUpdatedAt *time.Time
		if err := rows.Scan(
			&res.ID,
			&res.ProjectID,
			&res.Kind,
			&res.CreatedAt,
			&res.UpdatedAt,
			&runtimeState,
			&stateCreatedAt,
			&stateUpdatedAt,
		); err != nil {
			return nil, err
		}
		if runtimeState != nil && stateCreatedAt != nil && stateUpdatedAt != nil {
			res.ResourceState = &model.ResourceState{
				ResourceID:   res.ID,
				RuntimeState: *runtimeState,
				CreatedAt:    *stateCreatedAt,
				UpdatedAt:    *stateUpdatedAt,
			}
		}
		out = append(out, res)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (p *PsqlDB) GetResource(ctx context.Context, projectID string, resourceID string) (model.Resource, error) {
	const query = `
		SELECT
			r.id,
			r.project_id,
			r.kind,
			r.created_at,
			r.updated_at,
			rs.runtime_state,
			rs.created_at,
			rs.updated_at
		FROM resources r
		LEFT JOIN resource_states rs ON rs.resource_id = r.id
		WHERE r.project_id = $1
		  AND r.id = $2
	`
	var res model.Resource
	var runtimeState *string
	var stateCreatedAt *time.Time
	var stateUpdatedAt *time.Time
	if err := p.pool.QueryRow(ctx, query, projectID, resourceID).Scan(
		&res.ID,
		&res.ProjectID,
		&res.Kind,
		&res.CreatedAt,
		&res.UpdatedAt,
		&runtimeState,
		&stateCreatedAt,
		&stateUpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Resource{}, ErrResourceNotFound
		}
		return model.Resource{}, err
	}
	if runtimeState != nil && stateCreatedAt != nil && stateUpdatedAt != nil {
		res.ResourceState = &model.ResourceState{
			ResourceID:   res.ID,
			RuntimeState: *runtimeState,
			CreatedAt:    *stateCreatedAt,
			UpdatedAt:    *stateUpdatedAt,
		}
	}
	return res, nil
}

func (p *PsqlDB) CreateDatabase(ctx context.Context, params CreateDatabaseParams) (model.DBInstance, model.Secret, model.SecretVersion, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.DBInstance{}, model.Secret{}, model.SecretVersion{}, err
	}
	defer tx.Rollback(ctx)

	const createResourceQuery = `
		INSERT INTO resources (id, project_id, kind)
		VALUES ($1, $2, 'database')
		RETURNING id
	`
	var resourceID string
	if err := tx.QueryRow(ctx, createResourceQuery, params.DBID, params.ProjectID).Scan(&resourceID); err != nil {
		return model.DBInstance{}, model.Secret{}, model.SecretVersion{}, err
	}

	const createDBQuery = `
		INSERT INTO dbis (project_id, resource_id, engine, name, normalized_name, desired_runtime_state, description)
		VALUES ($1, $2, 'postgresql', $3, $4, 'running', $5)
		RETURNING resource_id, engine, name, normalized_name, desired_runtime_state, description
	`
	var dbRow model.DBInstance
	if err := tx.QueryRow(ctx, createDBQuery, params.ProjectID, resourceID, params.Name, params.NormalizedName, params.Description).Scan(
		&dbRow.ResourceID,
		&dbRow.Engine,
		&dbRow.Name,
		&dbRow.NormalizedName,
		&dbRow.DesiredRuntimeState,
		&dbRow.Description,
	); err != nil {
		return model.DBInstance{}, model.Secret{}, model.SecretVersion{}, err
	}

	const createSecretResourceQuery = `
		INSERT INTO resources (id, project_id, kind)
		VALUES ($1, $2, 'secret')
		RETURNING id
	`
	var secretResourceID string
	if err := tx.QueryRow(ctx, createSecretResourceQuery, params.SecretID, params.ProjectID).Scan(&secretResourceID); err != nil {
		return model.DBInstance{}, model.Secret{}, model.SecretVersion{}, err
	}

	secretName := DatabasePasswordSecretName(dbRow.ResourceID)
	secretDescription := DatabasePasswordSecretDescription(dbRow.Name, dbRow.ResourceID)

	const createSecretQuery = `
		INSERT INTO secrets (project_id, resource_id, name, description, payload_kind, protection_class, current_version_no, created_by_subject_id)
		VALUES ($1, $2, $3, $4, $5, $6, 1, $7)
		RETURNING project_id, resource_id, name, description, payload_kind, protection_class, current_version_no, created_by_subject_id, created_at, updated_at, scheduled_destroy_at
	`
	var secret model.Secret
	if err := tx.QueryRow(ctx, createSecretQuery, params.ProjectID, secretResourceID, secretName, &secretDescription, model.SecretPayloadKindText, model.SecretProtectionClassServerManaged, params.ActorSubjectID).Scan(
		&secret.ProjectID,
		&secret.ResourceID,
		&secret.Name,
		&secret.Description,
		&secret.PayloadKind,
		&secret.ProtectionClass,
		&secret.CurrentVersionNo,
		&secret.CreatedBySubjectID,
		&secret.CreatedAt,
		&secret.UpdatedAt,
		&secret.ScheduledDestroyAt,
	); err != nil {
		return model.DBInstance{}, model.Secret{}, model.SecretVersion{}, err
	}

	const createSecretVersionQuery = `
		INSERT INTO secret_versions (project_id, secret_id, version_no, state, payload_kind, created_by_subject_id)
		VALUES ($1, $2, 1, 'active', $3, $4)
		RETURNING project_id, secret_id, version_no, state, payload_kind, created_by_subject_id, created_at, updated_at, disabled_at
	`
	var version model.SecretVersion
	if err := tx.QueryRow(ctx, createSecretVersionQuery, params.ProjectID, secretResourceID, model.SecretPayloadKindText, params.ActorSubjectID).Scan(
		&version.ProjectID,
		&version.SecretID,
		&version.VersionNo,
		&version.State,
		&version.PayloadKind,
		&version.CreatedBySubjectID,
		&version.CreatedAt,
		&version.UpdatedAt,
		&version.DisabledAt,
	); err != nil {
		return model.DBInstance{}, model.Secret{}, model.SecretVersion{}, err
	}

	const createSecretMaterialQuery = `
		INSERT INTO secret_version_materials (
			project_id, secret_id, version_no, encryption_key_id,
			crypto_provider, crypto_envelope_version, content_algorithm,
			aad_context, encrypted_message
		)
		VALUES ($1, $2, 1, $3, $4, $5, $6, $7::jsonb, $8)
	`
	if _, err := tx.Exec(ctx, createSecretMaterialQuery,
		params.ProjectID,
		secretResourceID,
		params.EncryptionKeyID,
		params.CryptoProvider,
		params.CryptoEnvelopeVersion,
		params.ContentAlgorithm,
		string(params.AADContext),
		params.EncryptedMessage,
	); err != nil {
		return model.DBInstance{}, model.Secret{}, model.SecretVersion{}, err
	}

	const createDBVerifierQuery = `
		INSERT INTO dbi_verifiers (project_id, dbi_id, password_secret_id, password_verifier, password_desired_version, password_desired_state)
		VALUES ($1, $2, $3, $4, $5, 'present')
	`
	if _, err := tx.Exec(ctx, createDBVerifierQuery, params.ProjectID, dbRow.ResourceID, secret.ResourceID, params.PasswordVerifier, version.VersionNo); err != nil {
		return model.DBInstance{}, model.Secret{}, model.SecretVersion{}, err
	}

	tagKey, tagValue := DatabaseSecretTag(dbRow.ResourceID, secret.ResourceID)
	const createTagQuery = `
		INSERT INTO tags (project_id, tag_key, tag_value, color, is_system, is_readonly)
		VALUES ($1, $2, $3, NULL, true, true)
		RETURNING id
	`
	var tagID int64
	if err := tx.QueryRow(ctx, createTagQuery, params.ProjectID, tagKey, tagValue).Scan(&tagID); err != nil {
		return model.DBInstance{}, model.Secret{}, model.SecretVersion{}, err
	}

	const attachTagQuery = `
		INSERT INTO resource_tags (project_id, resource_id, tag_id)
		VALUES ($1, $2, $3)
	`
	if _, err := tx.Exec(ctx, attachTagQuery, params.ProjectID, dbRow.ResourceID, tagID); err != nil {
		return model.DBInstance{}, model.Secret{}, model.SecretVersion{}, err
	}
	if _, err := tx.Exec(ctx, attachTagQuery, params.ProjectID, secret.ResourceID, tagID); err != nil {
		return model.DBInstance{}, model.Secret{}, model.SecretVersion{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return model.DBInstance{}, model.Secret{}, model.SecretVersion{}, err
	}
	return dbRow, secret, version, nil
}

func (p *PsqlDB) ListDatabases(ctx context.Context, projectID string) ([]model.DBInstance, error) {
	const query = `
		SELECT
			d.resource_id,
			d.engine,
			d.name,
			d.normalized_name,
			d.desired_runtime_state,
			d.description,
			rs.runtime_state,
			rs.created_at,
			rs.updated_at
		FROM dbis d
		INNER JOIN resources r ON r.id = d.resource_id
		LEFT JOIN resource_states rs ON rs.resource_id = r.id
		WHERE r.project_id = $1
		  AND r.kind = 'database'
		ORDER BY d.resource_id DESC
	`
	rows, err := p.pool.Query(ctx, query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.DBInstance, 0)
	for rows.Next() {
		var row model.DBInstance
		var runtimeState *string
		var stateCreatedAt *time.Time
		var stateUpdatedAt *time.Time
		if err := rows.Scan(
			&row.ResourceID,
			&row.Engine,
			&row.Name,
			&row.NormalizedName,
			&row.DesiredRuntimeState,
			&row.Description,
			&runtimeState,
			&stateCreatedAt,
			&stateUpdatedAt,
		); err != nil {
			return nil, err
		}
		if runtimeState != nil && stateCreatedAt != nil && stateUpdatedAt != nil {
			row.ResourceState = &model.ResourceState{
				ResourceID:   row.ResourceID,
				RuntimeState: *runtimeState,
				CreatedAt:    *stateCreatedAt,
				UpdatedAt:    *stateUpdatedAt,
			}
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (p *PsqlDB) GetDatabase(ctx context.Context, _ uuid.UUID, projectID string, resourceID string) (model.DBInstance, error) {
	const query = `
		SELECT
			d.resource_id,
			d.engine,
			d.name,
			d.normalized_name,
			d.desired_runtime_state,
			d.description,
			rs.runtime_state,
			rs.created_at,
			rs.updated_at
		FROM dbis d
		JOIN resources r ON r.id = d.resource_id
		LEFT JOIN resource_states rs ON rs.resource_id = r.id
		WHERE r.project_id = $1
		  AND r.id = $2
		  AND r.kind = 'database'
	`
	var dbRow model.DBInstance
	var runtimeState *string
	var stateCreatedAt *time.Time
	var stateUpdatedAt *time.Time
	if err := p.pool.QueryRow(ctx, query, projectID, resourceID).Scan(
		&dbRow.ResourceID,
		&dbRow.Engine,
		&dbRow.Name,
		&dbRow.NormalizedName,
		&dbRow.DesiredRuntimeState,
		&dbRow.Description,
		&runtimeState,
		&stateCreatedAt,
		&stateUpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DBInstance{}, ErrResourceNotFound
		}
		return model.DBInstance{}, err
	}
	if runtimeState != nil && stateCreatedAt != nil && stateUpdatedAt != nil {
		dbRow.ResourceState = &model.ResourceState{
			ResourceID:   dbRow.ResourceID,
			RuntimeState: *runtimeState,
			CreatedAt:    *stateCreatedAt,
			UpdatedAt:    *stateUpdatedAt,
		}
	}
	return dbRow, nil
}

func (p *PsqlDB) UpdateDatabase(ctx context.Context, projectID string, resourceID string, name *string, description *string) (model.DBInstance, error) {
	const query = `
		WITH updated_db AS (
			UPDATE dbis d
			SET
				name = COALESCE($3, d.name),
				description = COALESCE($4, d.description)
			FROM resources r
			WHERE d.resource_id = r.id
			  AND r.project_id = $1
			  AND r.id = $2
			  AND r.kind = 'database'
			RETURNING d.resource_id, d.engine, d.name, d.normalized_name, d.desired_runtime_state, d.description
		)
		SELECT resource_id, engine, name, normalized_name, desired_runtime_state, description
		FROM updated_db
	`
	var row model.DBInstance
	if err := p.pool.QueryRow(ctx, query, projectID, resourceID, name, description).Scan(
		&row.ResourceID,
		&row.Engine,
		&row.Name,
		&row.NormalizedName,
		&row.DesiredRuntimeState,
		&row.Description,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DBInstance{}, ErrResourceNotFound
		}
		return model.DBInstance{}, err
	}
	return row, nil
}

func (p *PsqlDB) SetDatabaseDesiredRuntimeState(ctx context.Context, projectID string, resourceID string, desiredRuntimeState string) (model.DBInstance, error) {
	const query = `
		WITH updated_db AS (
			UPDATE dbis d
			SET desired_runtime_state = $3
			FROM resources r
			WHERE d.resource_id = r.id
			  AND r.project_id = $1
			  AND r.id = $2
			  AND r.kind = 'database'
			RETURNING d.resource_id, d.engine, d.name, d.normalized_name, d.desired_runtime_state, d.description
		)
		SELECT resource_id, engine, name, normalized_name, desired_runtime_state, description
		FROM updated_db
	`
	var row model.DBInstance
	if err := p.pool.QueryRow(ctx, query, projectID, resourceID, desiredRuntimeState).Scan(
		&row.ResourceID,
		&row.Engine,
		&row.Name,
		&row.NormalizedName,
		&row.DesiredRuntimeState,
		&row.Description,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DBInstance{}, ErrResourceNotFound
		}
		return model.DBInstance{}, err
	}
	return row, nil
}

func (p *PsqlDB) GetDatabaseConnParams(ctx context.Context, projectID string, resourceID string) (model.DBInstance, model.Secret, error) {
	dbRow, err := p.GetDatabase(ctx, uuid.Nil, projectID, resourceID)
	if err != nil {
		return model.DBInstance{}, model.Secret{}, err
	}

	var matchedSecret *model.Secret
	tagKeyPrefix, _ := DatabaseSecretTag(dbRow.ResourceID, "")
	tags, err := p.ListResourceTags(ctx, projectID, resourceID)
	if err != nil {
		return model.DBInstance{}, model.Secret{}, err
	}

	for _, tag := range tags {
		if tag.TagKey != tagKeyPrefix || !tag.IsSystem {
			continue
		}
		secrets, err := p.listSecretsByTagID(ctx, projectID, tag.ID)
		if err != nil {
			return model.DBInstance{}, model.Secret{}, err
		}
		for _, secret := range secrets {
			expectedTagKey, expectedTagValue := DatabaseSecretTag(dbRow.ResourceID, secret.ResourceID)
			if tag.TagKey != expectedTagKey || tag.TagValue != expectedTagValue {
				continue
			}
			if matchedSecret != nil {
				return model.DBInstance{}, model.Secret{}, ErrMultipleResourceRows
			}
			secretCopy := secret
			matchedSecret = &secretCopy
		}
	}

	if matchedSecret == nil {
		return model.DBInstance{}, model.Secret{}, ErrResourceNotFound
	}
	return dbRow, *matchedSecret, nil
}

func (p *PsqlDB) listSecretsByTagID(ctx context.Context, projectID string, tagID int64) ([]model.Secret, error) {
	const query = `
		SELECT
			s.project_id,
			s.resource_id,
			s.name,
			s.description,
			s.payload_kind,
			s.protection_class,
			s.current_version_no,
			s.created_by_subject_id,
			s.created_at,
			s.updated_at,
			s.scheduled_destroy_at
		FROM resource_tags rt
		INNER JOIN resources r
			ON r.id = rt.resource_id
		   AND r.project_id = rt.project_id
		   AND r.kind = 'secret'
		INNER JOIN secrets s ON s.resource_id = r.id
		WHERE rt.project_id = $1
		  AND rt.tag_id = $2
		ORDER BY s.resource_id DESC
	`
	rows, err := p.pool.Query(ctx, query, projectID, tagID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.Secret, 0)
	for rows.Next() {
		var secret model.Secret
		if err := rows.Scan(
			&secret.ProjectID,
			&secret.ResourceID,
			&secret.Name,
			&secret.Description,
			&secret.PayloadKind,
			&secret.ProtectionClass,
			&secret.CurrentVersionNo,
			&secret.CreatedBySubjectID,
			&secret.CreatedAt,
			&secret.UpdatedAt,
			&secret.ScheduledDestroyAt,
		); err != nil {
			return nil, err
		}
		out = append(out, secret)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (p *PsqlDB) ClaimDatabaseTermination(ctx context.Context, projectID string, resourceID string) (model.DBInstance, model.DBInstanceVerifier, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.DBInstance{}, model.DBInstanceVerifier{}, err
	}
	defer tx.Rollback(ctx)

	const updateDBQuery = `
		UPDATE dbis d
		SET desired_runtime_state = 'terminated'
		FROM resources r
		WHERE d.resource_id = r.id
		  AND r.project_id = $1
		  AND d.resource_id = $2
		  AND r.kind = 'database'
		RETURNING d.resource_id, d.engine, d.name, d.normalized_name, d.desired_runtime_state, d.description
	`
	var dbRow model.DBInstance
	if err := tx.QueryRow(ctx, updateDBQuery, projectID, resourceID).Scan(
		&dbRow.ResourceID,
		&dbRow.Engine,
		&dbRow.Name,
		&dbRow.NormalizedName,
		&dbRow.DesiredRuntimeState,
		&dbRow.Description,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DBInstance{}, model.DBInstanceVerifier{}, ErrResourceNotFound
		}
		return model.DBInstance{}, model.DBInstanceVerifier{}, err
	}

	const updateVerifierQuery = `
		UPDATE dbi_verifiers
		SET password_desired_state = 'absent'
		WHERE project_id = $1
		  AND dbi_id = $2
		RETURNING project_id, dbi_id, password_secret_id, password_verifier, password_desired_version, password_desired_state
	`
	var verifier model.DBInstanceVerifier
	if err := tx.QueryRow(ctx, updateVerifierQuery, projectID, dbRow.ResourceID).Scan(
		&verifier.ProjectID,
		&verifier.DBInstanceID,
		&verifier.PasswordSecretID,
		&verifier.PasswordVerifier,
		&verifier.PasswordDesiredVersion,
		&verifier.PasswordDesiredState,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DBInstance{}, model.DBInstanceVerifier{}, ErrResourceNotFound
		}
		return model.DBInstance{}, model.DBInstanceVerifier{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return model.DBInstance{}, model.DBInstanceVerifier{}, err
	}
	return dbRow, verifier, nil
}

func (p *PsqlDB) CreateSecretWithInitialVersion(ctx context.Context, params CreateSecretWithInitialVersionParams) (model.Secret, model.SecretVersion, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.Secret{}, model.SecretVersion{}, err
	}
	defer tx.Rollback(ctx)

	const createResourceQuery = `
		INSERT INTO resources (id, project_id, kind)
		VALUES ($1, $2, 'secret')
		RETURNING id
	`
	var resourceID string
	if err := tx.QueryRow(ctx, createResourceQuery, params.SecretID, params.ProjectID).Scan(&resourceID); err != nil {
		return model.Secret{}, model.SecretVersion{}, err
	}

	const createSecretQuery = `
		INSERT INTO secrets (project_id, resource_id, name, description, payload_kind, protection_class, current_version_no, created_by_subject_id)
		VALUES ($1, $2, $3, $4, $5, $6, 1, $7)
		RETURNING project_id, resource_id, name, description, payload_kind, protection_class, current_version_no, created_by_subject_id, created_at, updated_at, scheduled_destroy_at
	`
	var secret model.Secret
	if err := tx.QueryRow(ctx, createSecretQuery, params.ProjectID, resourceID, params.Name, params.Description, params.PayloadKind, params.ProtectionClass, params.CreatedBySubjectID).Scan(
		&secret.ProjectID,
		&secret.ResourceID,
		&secret.Name,
		&secret.Description,
		&secret.PayloadKind,
		&secret.ProtectionClass,
		&secret.CurrentVersionNo,
		&secret.CreatedBySubjectID,
		&secret.CreatedAt,
		&secret.UpdatedAt,
		&secret.ScheduledDestroyAt,
	); err != nil {
		return model.Secret{}, model.SecretVersion{}, err
	}

	const createSecretVersionQuery = `
		INSERT INTO secret_versions (project_id, secret_id, version_no, state, payload_kind, created_by_subject_id)
		VALUES ($1, $2, 1, 'active', $3, $4)
		RETURNING project_id, secret_id, version_no, state, payload_kind, created_by_subject_id, created_at, updated_at, disabled_at
	`
	var version model.SecretVersion
	if err := tx.QueryRow(ctx, createSecretVersionQuery, params.ProjectID, resourceID, params.PayloadKind, params.CreatedBySubjectID).Scan(
		&version.ProjectID,
		&version.SecretID,
		&version.VersionNo,
		&version.State,
		&version.PayloadKind,
		&version.CreatedBySubjectID,
		&version.CreatedAt,
		&version.UpdatedAt,
		&version.DisabledAt,
	); err != nil {
		return model.Secret{}, model.SecretVersion{}, err
	}

	const createSecretMaterialQuery = `
		INSERT INTO secret_version_materials (
			project_id, secret_id, version_no, encryption_key_id,
			crypto_provider, crypto_envelope_version, content_algorithm,
			aad_context, encrypted_message
		)
		VALUES ($1, $2, 1, $3, $4, $5, $6, $7::jsonb, $8)
	`
	if _, err := tx.Exec(ctx, createSecretMaterialQuery,
		params.ProjectID,
		resourceID,
		params.EncryptionKeyID,
		params.CryptoProvider,
		params.CryptoEnvelopeVersion,
		params.ContentAlgorithm,
		string(params.AADContext),
		params.EncryptedMessage,
	); err != nil {
		return model.Secret{}, model.SecretVersion{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return model.Secret{}, model.SecretVersion{}, err
	}
	return secret, version, nil
}

func (p *PsqlDB) ListSecrets(ctx context.Context, projectID string) ([]model.Secret, error) {
	const query = `
		SELECT
			s.project_id,
			s.resource_id,
			s.name,
			s.description,
			s.payload_kind,
			s.protection_class,
			s.current_version_no,
			s.created_by_subject_id,
			s.created_at,
			s.updated_at,
			s.scheduled_destroy_at
		FROM secrets s
		INNER JOIN resources r ON r.id = s.resource_id
		WHERE r.project_id = $1
		  AND r.kind = 'secret'
		ORDER BY s.resource_id DESC
	`
	rows, err := p.pool.Query(ctx, query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.Secret, 0)
	for rows.Next() {
		var row model.Secret
		if err := rows.Scan(
			&row.ProjectID,
			&row.ResourceID,
			&row.Name,
			&row.Description,
			&row.PayloadKind,
			&row.ProtectionClass,
			&row.CurrentVersionNo,
			&row.CreatedBySubjectID,
			&row.CreatedAt,
			&row.UpdatedAt,
			&row.ScheduledDestroyAt,
		); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (p *PsqlDB) GetSecret(ctx context.Context, projectID string, resourceID string) (model.Secret, error) {
	const query = `
		SELECT
			s.project_id,
			s.resource_id,
			s.name,
			s.description,
			s.payload_kind,
			s.protection_class,
			s.current_version_no,
			s.created_by_subject_id,
			s.created_at,
			s.updated_at,
			s.scheduled_destroy_at,
			rs.runtime_state,
			rs.created_at,
			rs.updated_at,
			dv.password_desired_version,
			dv.password_desired_state,
			dv.created_at,
			dv.updated_at
		FROM secrets s
		INNER JOIN resources r ON r.id = s.resource_id
		LEFT JOIN resource_states rs ON rs.resource_id = r.id
		LEFT JOIN LATERAL (
			SELECT v.password_desired_version, v.password_desired_state, v.created_at, v.updated_at
			FROM dbi_verifiers v
			WHERE v.project_id = r.project_id
			  AND v.password_secret_id = s.resource_id
			LIMIT 1
		) dv ON true
		WHERE r.project_id = $1
		  AND s.resource_id = $2
		  AND r.kind = 'secret'
	`
	var secret model.Secret
	var runtimeState *string
	var stateCreatedAt *time.Time
	var stateUpdatedAt *time.Time
	var pwdDesVer *int
	var pwdDesState *string
	var vrfCreated *time.Time
	var vrfUpdated *time.Time
	if err := p.pool.QueryRow(ctx, query, projectID, resourceID).Scan(
		&secret.ProjectID,
		&secret.ResourceID,
		&secret.Name,
		&secret.Description,
		&secret.PayloadKind,
		&secret.ProtectionClass,
		&secret.CurrentVersionNo,
		&secret.CreatedBySubjectID,
		&secret.CreatedAt,
		&secret.UpdatedAt,
		&secret.ScheduledDestroyAt,
		&runtimeState,
		&stateCreatedAt,
		&stateUpdatedAt,
		&pwdDesVer,
		&pwdDesState,
		&vrfCreated,
		&vrfUpdated,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Secret{}, ErrResourceNotFound
		}
		return model.Secret{}, err
	}
	if runtimeState != nil && stateCreatedAt != nil && stateUpdatedAt != nil {
		secret.ResourceState = &model.ResourceState{
			ResourceID:   secret.ResourceID,
			RuntimeState: *runtimeState,
			CreatedAt:    *stateCreatedAt,
			UpdatedAt:    *stateUpdatedAt,
		}
	}
	if pwdDesVer != nil && pwdDesState != nil && vrfCreated != nil && vrfUpdated != nil {
		secret.PasswordVerifier = &model.SecretPasswordVerifierMeta{
			PasswordDesiredVersion: *pwdDesVer,
			PasswordDesiredState:   *pwdDesState,
			CreatedAt:              *vrfCreated,
			UpdatedAt:              *vrfUpdated,
		}
	}
	tags, err := p.ListResourceTags(ctx, projectID, secret.ResourceID)
	if err != nil {
		return model.Secret{}, err
	}
	if len(tags) > 0 {
		secret.Tags = tags
	}
	return secret, nil
}

func (p *PsqlDB) UpdateSecretMeta(ctx context.Context, projectID string, resourceID string, description *string) (model.Secret, error) {
	const query = `
		WITH updated_secret AS (
			UPDATE secrets s
			SET description = $3
			FROM resources r
			WHERE s.resource_id = r.id
			  AND r.project_id = $1
			  AND r.id = $2
			  AND r.kind = 'secret'
			RETURNING s.project_id, s.resource_id, s.name, s.description, s.payload_kind, s.protection_class, s.current_version_no, s.created_by_subject_id, s.created_at, s.updated_at, s.scheduled_destroy_at
		)
		SELECT project_id, resource_id, name, description, payload_kind, protection_class, current_version_no, created_by_subject_id, created_at, updated_at, scheduled_destroy_at
		FROM updated_secret
	`
	var secret model.Secret
	if err := p.pool.QueryRow(ctx, query, projectID, resourceID, description).Scan(
		&secret.ProjectID,
		&secret.ResourceID,
		&secret.Name,
		&secret.Description,
		&secret.PayloadKind,
		&secret.ProtectionClass,
		&secret.CurrentVersionNo,
		&secret.CreatedBySubjectID,
		&secret.CreatedAt,
		&secret.UpdatedAt,
		&secret.ScheduledDestroyAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Secret{}, ErrResourceNotFound
		}
		return model.Secret{}, err
	}
	return secret, nil
}

func (p *PsqlDB) ListSecretVersions(ctx context.Context, projectID string, secretID string) ([]model.SecretVersion, error) {
	const query = `
		SELECT project_id, secret_id, version_no, state, payload_kind, created_by_subject_id, created_at, updated_at, disabled_at
		FROM secret_versions
		WHERE project_id = $1 AND secret_id = $2
		ORDER BY version_no DESC
	`
	rows, err := p.pool.Query(ctx, query, projectID, secretID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.SecretVersion, 0)
	for rows.Next() {
		var row model.SecretVersion
		if err := rows.Scan(&row.ProjectID, &row.SecretID, &row.VersionNo, &row.State, &row.PayloadKind, &row.CreatedBySubjectID, &row.CreatedAt, &row.UpdatedAt, &row.DisabledAt); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (p *PsqlDB) GetSecretVersion(ctx context.Context, projectID string, secretID string, versionNo int) (model.SecretVersion, error) {
	const query = `
		SELECT project_id, secret_id, version_no, state, payload_kind, created_by_subject_id, created_at, updated_at, disabled_at
		FROM secret_versions
		WHERE project_id = $1 AND secret_id = $2 AND version_no = $3
	`
	var row model.SecretVersion
	if err := p.pool.QueryRow(ctx, query, projectID, secretID, versionNo).Scan(
		&row.ProjectID,
		&row.SecretID,
		&row.VersionNo,
		&row.State,
		&row.PayloadKind,
		&row.CreatedBySubjectID,
		&row.CreatedAt,
		&row.UpdatedAt,
		&row.DisabledAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.SecretVersion{}, ErrResourceNotFound
		}
		return model.SecretVersion{}, err
	}
	return row, nil
}

func (p *PsqlDB) CreateSecretVersion(ctx context.Context, params CreateSecretVersionParams) (model.SecretVersion, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.SecretVersion{}, err
	}
	defer tx.Rollback(ctx)

	const lockSecretQuery = `
		SELECT current_version_no
		FROM secrets
		WHERE project_id = $1 AND resource_id = $2
		FOR UPDATE
	`
	var currentVersionNo int
	if err := tx.QueryRow(ctx, lockSecretQuery, params.ProjectID, params.SecretID).Scan(&currentVersionNo); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.SecretVersion{}, ErrResourceNotFound
		}
		return model.SecretVersion{}, err
	}

	newVersionNo := currentVersionNo + 1
	if params.VersionNo != newVersionNo {
		return model.SecretVersion{}, ErrInvalidSecretVersion
	}
	const insertVersionQuery = `
		INSERT INTO secret_versions (project_id, secret_id, version_no, state, payload_kind, created_by_subject_id)
		VALUES ($1, $2, $3, 'active', $4, $5)
		RETURNING project_id, secret_id, version_no, state, payload_kind, created_by_subject_id, created_at, updated_at, disabled_at
	`
	var version model.SecretVersion
	if err := tx.QueryRow(ctx, insertVersionQuery, params.ProjectID, params.SecretID, newVersionNo, params.PayloadKind, params.CreatedBySubjectID).Scan(
		&version.ProjectID,
		&version.SecretID,
		&version.VersionNo,
		&version.State,
		&version.PayloadKind,
		&version.CreatedBySubjectID,
		&version.CreatedAt,
		&version.UpdatedAt,
		&version.DisabledAt,
	); err != nil {
		return model.SecretVersion{}, err
	}

	const insertMaterialQuery = `
		INSERT INTO secret_version_materials (
			project_id, secret_id, version_no, encryption_key_id,
			crypto_provider, crypto_envelope_version, content_algorithm,
			aad_context, encrypted_message
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
	`
	if _, err := tx.Exec(ctx, insertMaterialQuery,
		params.ProjectID,
		params.SecretID,
		newVersionNo,
		params.EncryptionKeyID,
		params.CryptoProvider,
		params.CryptoEnvelopeVersion,
		params.ContentAlgorithm,
		string(params.AADContext),
		params.EncryptedMessage,
	); err != nil {
		return model.SecretVersion{}, err
	}

	const updateSecretQuery = `
		UPDATE secrets
		SET current_version_no = $3
		WHERE project_id = $1 AND resource_id = $2
	`
	if _, err := tx.Exec(ctx, updateSecretQuery, params.ProjectID, params.SecretID, newVersionNo); err != nil {
		return model.SecretVersion{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return model.SecretVersion{}, err
	}
	return version, nil
}

func (p *PsqlDB) DisableSecretVersion(ctx context.Context, projectID string, secretID string, versionNo int) (model.SecretVersion, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.SecretVersion{}, err
	}
	defer tx.Rollback(ctx)

	const lockSecretQuery = `
		SELECT current_version_no
		FROM secrets
		WHERE project_id = $1 AND resource_id = $2
		FOR UPDATE
	`
	var currentVersionNo int
	if err := tx.QueryRow(ctx, lockSecretQuery, projectID, secretID).Scan(&currentVersionNo); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.SecretVersion{}, ErrResourceNotFound
		}
		return model.SecretVersion{}, err
	}

	const lockVersionQuery = `
		SELECT state
		FROM secret_versions
		WHERE project_id = $1 AND secret_id = $2 AND version_no = $3
		FOR UPDATE
	`
	var state string
	if err := tx.QueryRow(ctx, lockVersionQuery, projectID, secretID, versionNo).Scan(&state); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.SecretVersion{}, ErrResourceNotFound
		}
		return model.SecretVersion{}, err
	}

	switch state {
	case model.SecretVersionStateDisabled:
		return model.SecretVersion{}, ErrSecretVersionAlreadyDisabled
	case model.SecretVersionStateActive:
	default:
		return model.SecretVersion{}, ErrInvalidSecretVersion
	}

	if versionNo == currentVersionNo {
		return model.SecretVersion{}, ErrCannotDisableCurrentSecretVersion
	}

	const verifierQuery = `
		SELECT EXISTS (
			SELECT 1 FROM dbi_verifiers
			WHERE project_id = $1
			  AND password_secret_id = $2
			  AND password_desired_version = $3
		)
	`
	var usedByVerifier bool
	if err := tx.QueryRow(ctx, verifierQuery, projectID, secretID, versionNo).Scan(&usedByVerifier); err != nil {
		return model.SecretVersion{}, err
	}
	if usedByVerifier {
		return model.SecretVersion{}, ErrSecretVersionReferencedByDBVerifier
	}

	const updateQuery = `
		UPDATE secret_versions
		SET state = 'disabled',
		    disabled_at = COALESCE(disabled_at, NOW())
		WHERE project_id = $1 AND secret_id = $2 AND version_no = $3
		  AND state = 'active'
		RETURNING project_id, secret_id, version_no, state, payload_kind, created_by_subject_id, created_at, updated_at, disabled_at
	`
	var row model.SecretVersion
	if err := tx.QueryRow(ctx, updateQuery, projectID, secretID, versionNo).Scan(
		&row.ProjectID,
		&row.SecretID,
		&row.VersionNo,
		&row.State,
		&row.PayloadKind,
		&row.CreatedBySubjectID,
		&row.CreatedAt,
		&row.UpdatedAt,
		&row.DisabledAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.SecretVersion{}, ErrUnexpectedEmptyReturn
		}
		return model.SecretVersion{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return model.SecretVersion{}, err
	}
	return row, nil
}

func (p *PsqlDB) GetSecretMaterialForReveal(ctx context.Context, projectID string, secretID string, versionNo int) (model.Secret, model.SecretVersion, model.SecretMaterial, error) {
	const query = `
		SELECT
			s.project_id, s.resource_id, s.name, s.description, s.payload_kind, s.protection_class,
			s.current_version_no, s.created_by_subject_id, s.created_at, s.updated_at, s.scheduled_destroy_at,
			sv.project_id, sv.secret_id, sv.version_no, sv.state, sv.payload_kind, sv.created_by_subject_id, sv.created_at, sv.updated_at, sv.disabled_at,
			svm.project_id, svm.secret_id, svm.version_no, svm.encryption_key_id, svm.crypto_provider,
			svm.crypto_envelope_version, svm.content_algorithm, svm.aad_context, svm.encrypted_message,
			ek.provider, ek.key_ref, ek.algorithm
		FROM secrets s
		INNER JOIN secret_versions sv
			ON sv.project_id = s.project_id
		   AND sv.secret_id = s.resource_id
		INNER JOIN secret_version_materials svm
			ON svm.project_id = sv.project_id
		   AND svm.secret_id = sv.secret_id
		   AND svm.version_no = sv.version_no
		INNER JOIN encryption_keys ek ON ek.id = svm.encryption_key_id
		WHERE s.project_id = $1
		  AND s.resource_id = $2
		  AND sv.version_no = $3
	`
	var secret model.Secret
	var version model.SecretVersion
	var material model.SecretMaterial
	if err := p.pool.QueryRow(ctx, query, projectID, secretID, versionNo).Scan(
		&secret.ProjectID, &secret.ResourceID, &secret.Name, &secret.Description, &secret.PayloadKind, &secret.ProtectionClass,
		&secret.CurrentVersionNo, &secret.CreatedBySubjectID, &secret.CreatedAt, &secret.UpdatedAt, &secret.ScheduledDestroyAt,
		&version.ProjectID, &version.SecretID, &version.VersionNo, &version.State, &version.PayloadKind, &version.CreatedBySubjectID, &version.CreatedAt, &version.UpdatedAt, &version.DisabledAt,
		&material.ProjectID, &material.SecretID, &material.VersionNo, &material.EncryptionKeyID, &material.CryptoProvider,
		&material.CryptoEnvelopeVersion, &material.ContentAlgorithm, &material.AADContext, &material.EncryptedMessage,
		&material.EncryptionKeyProvider, &material.EncryptionKeyRef, &material.EncryptionKeyAlgorithm,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Secret{}, model.SecretVersion{}, model.SecretMaterial{}, ErrResourceNotFound
		}
		return model.Secret{}, model.SecretVersion{}, model.SecretMaterial{}, err
	}
	return secret, version, material, nil
}

func (p *PsqlDB) GetActiveEncryptionKey(ctx context.Context) (model.EncryptionKey, error) {
	const query = `
		SELECT id, provider, key_ref, algorithm, status, created_at, updated_at, rotated_at
		FROM encryption_keys
		WHERE status = 'active'
		ORDER BY created_at DESC
		LIMIT 1
	`
	var key model.EncryptionKey
	if err := p.pool.QueryRow(ctx, query).Scan(&key.ID, &key.Provider, &key.KeyRef, &key.Algorithm, &key.Status, &key.CreatedAt, &key.UpdatedAt, &key.RotatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.EncryptionKey{}, ErrEncryptionKeyNotFound
		}
		return model.EncryptionKey{}, err
	}
	return key, nil
}

func (p *PsqlDB) IsDatabasePasswordSecret(ctx context.Context, projectID string, secretID string) (bool, error) {
	const query = `
		SELECT EXISTS (
			SELECT 1
			FROM dbi_verifiers
			WHERE project_id = $1
			  AND password_secret_id = $2
			  AND password_desired_state = 'present'
		)
	`
	var exists bool
	if err := p.pool.QueryRow(ctx, query, projectID, secretID).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

func (p *PsqlDB) SetDatabasePasswordSecretVerifier(ctx context.Context, projectID string, secretID string, versionNo int, passwordVerifier string) (model.DBInstanceVerifier, error) {
	const q = `
		UPDATE dbi_verifiers
		SET password_verifier = $4,
		    password_desired_version = $3
		WHERE project_id = $1
		  AND password_secret_id = $2
		  AND password_desired_state = 'present'
		RETURNING project_id, dbi_id, password_secret_id, password_verifier, password_desired_version, password_desired_state
	`
	var v model.DBInstanceVerifier
	err := p.pool.QueryRow(ctx, q, projectID, secretID, versionNo, passwordVerifier).Scan(
		&v.ProjectID,
		&v.DBInstanceID,
		&v.PasswordSecretID,
		&v.PasswordVerifier,
		&v.PasswordDesiredVersion,
		&v.PasswordDesiredState,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DBInstanceVerifier{}, ErrDBPasswordVerifierNotUpdated
		}
		return model.DBInstanceVerifier{}, err
	}
	return v, nil
}

func (p *PsqlDB) GetDatabasePasswordSecretMaterial(ctx context.Context, projectID string, dbID string) (model.DBInstance, model.Secret, model.SecretVersion, model.SecretMaterial, error) {
	dbRow, secret, err := p.GetDatabaseConnParams(ctx, projectID, dbID)
	if err != nil {
		return model.DBInstance{}, model.Secret{}, model.SecretVersion{}, model.SecretMaterial{}, err
	}

	const query = `
		SELECT password_desired_version
		FROM dbi_verifiers
		WHERE project_id = $1
		  AND dbi_id = $2
		  AND password_secret_id = $3
		  AND password_desired_state = 'present'
	`
	var desiredVersion int
	if err := p.pool.QueryRow(ctx, query, projectID, dbRow.ResourceID, secret.ResourceID).Scan(&desiredVersion); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DBInstance{}, model.Secret{}, model.SecretVersion{}, model.SecretMaterial{}, ErrResourceNotFound
		}
		return model.DBInstance{}, model.Secret{}, model.SecretVersion{}, model.SecretMaterial{}, err
	}

	secretWithMeta, version, material, err := p.GetSecretMaterialForReveal(ctx, projectID, secret.ResourceID, desiredVersion)
	if err != nil {
		return model.DBInstance{}, model.Secret{}, model.SecretVersion{}, model.SecretMaterial{}, err
	}
	return dbRow, secretWithMeta, version, material, nil
}

func (p *PsqlDB) DeleteSecret(ctx context.Context, projectID string, resourceID string) error {
	usedByDatabase, err := p.IsDatabasePasswordSecret(ctx, projectID, resourceID)
	if err != nil {
		return err
	}
	if usedByDatabase {
		return ErrResourceInUse
	}

	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	const deleteSecretQuery = `
		DELETE FROM secrets s
		USING resources r
		WHERE s.resource_id = r.id
		  AND r.project_id = $1
		  AND r.id = $2
		  AND r.kind = 'secret'
		RETURNING s.resource_id
	`
	var deletedResourceID string
	if err := tx.QueryRow(ctx, deleteSecretQuery, projectID, resourceID).Scan(&deletedResourceID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrResourceNotFound
		}
		return err
	}

	const deleteResourceQuery = `
		DELETE FROM resources
		WHERE project_id = $1
		  AND id = $2
		  AND kind = 'secret'
	`
	cmd, err := tx.Exec(ctx, deleteResourceQuery, projectID, deletedResourceID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrResourceNotFound
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	return nil
}

func (p *PsqlDB) ListProjectTags(ctx context.Context, projectID string) ([]model.Tag, error) {
	const query = `
		SELECT id, project_id, tag_key, tag_value, color, is_system, is_readonly
		FROM tags
		WHERE project_id = $1
		ORDER BY tag_key, tag_value, id
	`
	rows, err := p.pool.Query(ctx, query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.Tag, 0)
	for rows.Next() {
		var row model.Tag
		if err := rows.Scan(&row.ID, &row.ProjectID, &row.TagKey, &row.TagValue, &row.Color, &row.IsSystem, &row.IsReadonly); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (p *PsqlDB) ListResourceTags(ctx context.Context, projectID string, resourceID string) ([]model.Tag, error) {
	const query = `
		SELECT t.id, t.project_id, t.tag_key, t.tag_value, t.color, t.is_system, t.is_readonly
		FROM tags t
		INNER JOIN resource_tags rt ON rt.tag_id = t.id AND rt.project_id = t.project_id
		WHERE rt.project_id = $1
		  AND rt.resource_id = $2
		ORDER BY t.tag_key, t.tag_value
	`
	rows, err := p.pool.Query(ctx, query, projectID, resourceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.Tag, 0)
	for rows.Next() {
		var row model.Tag
		if err := rows.Scan(&row.ID, &row.ProjectID, &row.TagKey, &row.TagValue, &row.Color, &row.IsSystem, &row.IsReadonly); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (p *PsqlDB) AttachResourceTag(
	ctx context.Context,
	projectID string,
	resourceID string,
	tagKey string,
	tagValue string,
	color *string,
) (model.Tag, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.Tag{}, err
	}
	defer tx.Rollback(ctx)

	const resolveResourceQuery = `
		SELECT id
		FROM resources
		WHERE project_id = $1 AND id = $2
	`
	var resolvedResource string
	if err := tx.QueryRow(ctx, resolveResourceQuery, projectID, resourceID).Scan(&resolvedResource); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Tag{}, ErrResourceNotFound
		}
		return model.Tag{}, err
	}

	const upsertTagQuery = `
		INSERT INTO tags (project_id, tag_key, tag_value, color)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (project_id, tag_key, tag_value)
		DO UPDATE SET color = COALESCE(EXCLUDED.color, tags.color)
		RETURNING id, project_id, tag_key, tag_value, color, is_system, is_readonly
	`
	var tag model.Tag
	if err := tx.QueryRow(ctx, upsertTagQuery, projectID, tagKey, tagValue, color).Scan(
		&tag.ID,
		&tag.ProjectID,
		&tag.TagKey,
		&tag.TagValue,
		&tag.Color,
		&tag.IsSystem,
		&tag.IsReadonly,
	); err != nil {
		return model.Tag{}, err
	}
	if tag.IsSystem || tag.IsReadonly {
		return model.Tag{}, ErrResourceTagImmutable
	}

	const attachQuery = `
		INSERT INTO resource_tags (project_id, resource_id, tag_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (project_id, resource_id, tag_id) DO NOTHING
	`
	if _, err := tx.Exec(ctx, attachQuery, projectID, resolvedResource, tag.ID); err != nil {
		return model.Tag{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return model.Tag{}, err
	}
	return tag, nil
}

func (p *PsqlDB) DetachResourceTag(ctx context.Context, projectID string, resourceID string, tagID int64) error {
	const query = `
		DELETE FROM resource_tags rt
		USING tags t
		WHERE t.project_id = rt.project_id
		  AND t.id = rt.tag_id
		  AND rt.project_id = $1
		  AND rt.resource_id = $2
		  AND rt.tag_id = $3
		  AND t.is_system = false
		  AND t.is_readonly = false
	`
	cmd, err := p.pool.Exec(ctx, query, projectID, resourceID, tagID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrResourceTagNotFound
	}
	return nil
}

func (p *PsqlDB) PgxPool() *pgxpool.Pool {
	return p.pool
}
