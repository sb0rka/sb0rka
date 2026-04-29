package db

import (
	"context"
	"errors"
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

func (p *PsqlDB) CreateProject(ctx context.Context, userID uuid.UUID, name string, description *string, isActive bool) (model.Project, error) {
	const query = `
		INSERT INTO projects (user_id, name, description, is_active)
		VALUES ($1, $2, $3, $4)
		RETURNING id, user_id, name, description, is_active, created_at, updated_at
	`

	var project model.Project

	err := p.pool.QueryRow(ctx, query, userID, name, description, isActive).Scan(
		&project.ID,
		&project.UserID,
		&project.Name,
		&project.Description,
		&project.IsActive,
		&project.CreatedAt,
		&project.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Project{}, ErrUnexpectedEmptyReturn
		}

		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			if pgErr.Code == "23505" { // unique_violation
				return model.Project{}, ErrProjectAlreadyExists
			}
		}

		return model.Project{}, err
	}

	return project, nil
}

func (p *PsqlDB) GetProject(ctx context.Context, userID uuid.UUID, id string) (model.Project, error) {
	const query = `
		SELECT id, user_id, name, description, is_active, created_at, updated_at
		FROM projects
		WHERE user_id = $1 AND id = $2
	`

	var project model.Project
	err := p.pool.QueryRow(ctx, query, userID, id).Scan(
		&project.ID,
		&project.UserID,
		&project.Name,
		&project.Description,
		&project.IsActive,
		&project.CreatedAt,
		&project.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Project{}, ErrProjectNotFound
		}
		return model.Project{}, err
	}

	return project, nil
}

func (p *PsqlDB) ListProjects(ctx context.Context, userID uuid.UUID) ([]model.Project, error) {
	const query = `
		SELECT id, user_id, name, description, is_active, created_at, updated_at
		FROM projects
		WHERE user_id = $1
		ORDER BY created_at DESC
	`

	rows, err := p.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := make([]model.Project, 0)
	for rows.Next() {
		var project model.Project
		if err := rows.Scan(
			&project.ID,
			&project.UserID,
			&project.Name,
			&project.Description,
			&project.IsActive,
			&project.CreatedAt,
			&project.UpdatedAt,
		); err != nil {
			return nil, err
		}
		projects = append(projects, project)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return projects, nil
}

// TODO(kompotkot): Replace with ListUserPlans
func (p *PsqlDB) GetUserPlan(ctx context.Context, userID uuid.UUID) (model.Plan, error) {
	const query = `
		SELECT
			p.id, p.name, p.description, p.is_public, p.is_available,
			p.db_limit, p.secret_limit, p.project_limit, p.group_limit,
			p.created_at, p.updated_at
		FROM user_plans up
		INNER JOIN plans p ON p.id = up.plan_id
		WHERE up.user_id = $1
		ORDER BY up.updated_at DESC
		LIMIT 1
	`

	var plan model.Plan
	err := p.pool.QueryRow(ctx, query, userID).Scan(
		&plan.ID,
		&plan.Name,
		&plan.Description,
		&plan.IsPublic,
		&plan.IsAvailable,
		&plan.DBLimit,
		&plan.SecretLimit,
		&plan.ProjectLimit,
		&plan.GroupLimit,
		&plan.CreatedAt,
		&plan.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Plan{}, ErrUserPlanNotFound
		}
		return model.Plan{}, err
	}

	return plan, nil
}

func (p *PsqlDB) ListPublicPlans(ctx context.Context) ([]model.Plan, error) {
	const query = `
		SELECT
			id, name, description, is_public, is_available,
			db_limit, secret_limit, project_limit, group_limit,
			created_at, updated_at
		FROM plans
		WHERE is_public = true AND is_available = true
		ORDER BY name ASC
	`

	rows, err := p.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	plans := make([]model.Plan, 0)
	for rows.Next() {
		var plan model.Plan
		if err := rows.Scan(
			&plan.ID,
			&plan.Name,
			&plan.Description,
			&plan.IsPublic,
			&plan.IsAvailable,
			&plan.DBLimit,
			&plan.SecretLimit,
			&plan.ProjectLimit,
			&plan.GroupLimit,
			&plan.CreatedAt,
			&plan.UpdatedAt,
		); err != nil {
			return nil, err
		}
		plans = append(plans, plan)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return plans, nil
}

func (p *PsqlDB) AttachPlanByID(ctx context.Context, userID uuid.UUID, planID uuid.UUID) error {
	const query = `
		INSERT INTO user_plans (user_id, plan_id)
		SELECT $1, id
		FROM plans
		WHERE id = $2
		LIMIT 1
	`

	commandTag, err := p.pool.Exec(ctx, query, userID, planID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrUserPlanAlreadyAttached
		}
		return err
	}
	if commandTag.RowsAffected() == 0 {
		return ErrPlanNotFound
	}

	return nil
}

func (p *PsqlDB) AttachPlanByName(ctx context.Context, userID uuid.UUID, planName string) error {
	const query = `
		INSERT INTO user_plans (user_id, plan_id)
		SELECT $1, id
		FROM plans
		WHERE name = $2
		LIMIT 1
	`

	commandTag, err := p.pool.Exec(ctx, query, userID, planName)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrUserPlanAlreadyAttached
		}
		return err
	}
	if commandTag.RowsAffected() == 0 {
		return ErrPlanNotFound
	}

	return nil
}

func (p *PsqlDB) AssertCanCreateProject(ctx context.Context, userID uuid.UUID) error {
	const hasPlansQuery = `SELECT EXISTS(SELECT 1 FROM user_plans WHERE user_id = $1)`
	var hasPlans bool
	if err := p.pool.QueryRow(ctx, hasPlansQuery, userID).Scan(&hasPlans); err != nil {
		return err
	}
	if !hasPlans {
		return ErrUserPlanNotFound
	}

	const maxLimitQuery = `
		SELECT COALESCE(MAX(p.project_limit), 0)
		FROM user_plans up
		INNER JOIN plans p ON p.id = up.plan_id
		WHERE up.user_id = $1
	`
	var maxProjects int
	if err := p.pool.QueryRow(ctx, maxLimitQuery, userID).Scan(&maxProjects); err != nil {
		return err
	}

	const countQuery = `SELECT COUNT(*) FROM projects WHERE user_id = $1`
	var n int64
	if err := p.pool.QueryRow(ctx, countQuery, userID).Scan(&n); err != nil {
		return err
	}

	if n >= int64(maxProjects) {
		return ErrProjectLimitReached
	}
	return nil
}

func (p *PsqlDB) AssertCanCreateResourceWithType(ctx context.Context, userID uuid.UUID, projectID string, kind string) error {
	const hasPlansQuery = `SELECT EXISTS(SELECT 1 FROM user_plans WHERE user_id = $1)`
	var hasPlans bool
	if err := p.pool.QueryRow(ctx, hasPlansQuery, userID).Scan(&hasPlans); err != nil {
		return err
	}
	if !hasPlans {
		return ErrUserPlanNotFound
	}

	const projectExistsQuery = `SELECT EXISTS(SELECT 1 FROM projects WHERE user_id = $1 AND id = $2)`
	var projectExists bool
	if err := p.pool.QueryRow(ctx, projectExistsQuery, userID, projectID).Scan(&projectExists); err != nil {
		return err
	}
	if !projectExists {
		return ErrProjectNotFound
	}

	var maxLimitQuery string
	switch kind {
	case "database":
		maxLimitQuery = `
			SELECT COALESCE(MAX(p.db_limit), 0)
			FROM user_plans up
			INNER JOIN plans p ON p.id = up.plan_id
			WHERE up.user_id = $1
		`
	case "secret":
		maxLimitQuery = `
			SELECT COALESCE(MAX(p.secret_limit), 0)
			FROM user_plans up
			INNER JOIN plans p ON p.id = up.plan_id
			WHERE up.user_id = $1
		`
	default:
		return ErrInvalidResourceKind
	}

	var maxLimit int
	if err := p.pool.QueryRow(ctx, maxLimitQuery, userID).Scan(&maxLimit); err != nil {
		return err
	}
	if maxLimit <= 0 {
		return ErrResourceLimitReached
	}

	const countQuery = `
		SELECT COUNT(*)
		FROM resources r
		INNER JOIN projects p ON p.id = r.project_id
		WHERE p.user_id = $1
		  AND p.id = $2
		  AND r.kind = $3
	`
	var n int64
	if err := p.pool.QueryRow(ctx, countQuery, userID, projectID, kind).Scan(&n); err != nil {
		return err
	}
	if n >= int64(maxLimit) {
		return ErrResourceLimitReached
	}
	return nil
}

func (p *PsqlDB) UpdateProject(ctx context.Context, userID uuid.UUID, id string, name *string, description *string) (model.Project, error) {
	const query = `
		UPDATE projects
		SET
			name = COALESCE($3, name),
			description = COALESCE($4, description),
			updated_at = NOW()
		WHERE user_id = $1 AND id = $2
		RETURNING id, user_id, name, description, is_active, created_at, updated_at
	`

	var project model.Project

	err := p.pool.QueryRow(ctx, query, userID, id, name, description).Scan(
		&project.ID,
		&project.UserID,
		&project.Name,
		&project.Description,
		&project.IsActive,
		&project.CreatedAt,
		&project.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Project{}, ErrProjectNotFound
		}
		return model.Project{}, err
	}

	return project, nil
}

func (p *PsqlDB) DeleteProject(ctx context.Context, userID uuid.UUID, id string) error {
	const query = `
		DELETE FROM projects
		WHERE user_id = $1 AND id = $2
	`

	cmd, err := p.pool.Exec(ctx, query, userID, id)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrProjectNotFound
	}
	return nil
}

func (p *PsqlDB) ListResources(ctx context.Context, userID uuid.UUID, projectID string) ([]model.Resource, error) {
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
		INNER JOIN projects p ON p.id = r.project_id
		LEFT JOIN resource_states rs ON rs.resource_id = r.id
		WHERE p.id = $2
		  AND p.user_id = $1
		ORDER BY r.created_at DESC
	`

	rows, err := p.pool.Query(ctx, query, userID, projectID)
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

func (p *PsqlDB) GetResource(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.Resource, error) {
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
		INNER JOIN projects p ON p.id = r.project_id
		LEFT JOIN resource_states rs ON rs.resource_id = r.id
		WHERE p.user_id = $1
		  AND r.project_id = $2
		  AND r.id = $3
	`

	var res model.Resource
	var runtimeState *string
	var stateCreatedAt *time.Time
	var stateUpdatedAt *time.Time
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID).Scan(
		&res.ID,
		&res.ProjectID,
		&res.Kind,
		&res.CreatedAt,
		&res.UpdatedAt,
		&runtimeState,
		&stateCreatedAt,
		&stateUpdatedAt,
	)
	if err != nil {
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

// TODO(kompotkot)
func (p *PsqlDB) DeactivateResource(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.Resource, error) {
	const query = `
		UPDATE resources r
		SET 
			updated_at = NOW()
		FROM projects p
		WHERE r.project_id = p.id
		  AND p.user_id = $1
		  AND r.project_id = $2
		  AND r.id = $3
		RETURNING r.id, r.project_id, r.kind, r.created_at, r.updated_at
	`

	var res model.Resource
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID).Scan(
		&res.ID,
		&res.ProjectID,
		&res.Kind,
		&res.CreatedAt,
		&res.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Resource{}, ErrResourceNotFound
		}
		return model.Resource{}, err
	}
	return res, nil
}

func (p *PsqlDB) DeleteResource(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) error {
	const query = `
		DELETE FROM resources r
		USING projects p
		WHERE r.project_id = p.id
		  AND p.user_id = $1
		  AND r.project_id = $2
		  AND r.id = $3
	`
	cmd, err := p.pool.Exec(ctx, query, userID, projectID, resourceID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrResourceNotFound
	}
	return nil
}

func (p *PsqlDB) CreateDatabase(ctx context.Context, userID uuid.UUID, projectID string, name string, normalizedName string, description *string) (model.DB, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.DB{}, err
	}
	defer tx.Rollback(ctx)

	const createResourceQuery = `
		INSERT INTO resources (project_id, kind)
		SELECT p.id, 'database'
		FROM projects p
		WHERE p.id = $1
		  AND p.user_id = $2
		RETURNING id
	`

	var resourceID string
	if err := tx.QueryRow(ctx, createResourceQuery, projectID, userID).Scan(&resourceID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DB{}, ErrProjectNotFound
		}
		return model.DB{}, err
	}

	const createDBQuery = `
		INSERT INTO dbs (resource_id, name, normalized_name, desired_runtime_state, description)
		VALUES ($1, $2, $3, 'running', $4)
		RETURNING resource_id, name, normalized_name, desired_runtime_state, description
	`

	var dbRow model.DB
	if err := tx.QueryRow(ctx, createDBQuery, resourceID, name, normalizedName, description).Scan(
		&dbRow.ResourceID,
		&dbRow.Name,
		&dbRow.NormalizedName,
		&dbRow.DesiredRuntimeState,
		&dbRow.Description,
	); err != nil {
		return model.DB{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return model.DB{}, err
	}

	return dbRow, nil
}

func (p *PsqlDB) ListDatabases(ctx context.Context, userID uuid.UUID, projectID string) ([]model.DB, error) {
	const query = `
		SELECT d.resource_id, d.name, d.normalized_name, d.description
		FROM dbs d
		INNER JOIN resources r ON r.id = d.resource_id
		INNER JOIN projects p ON p.id = r.project_id
		WHERE p.user_id = $1
		  AND p.id = $2
		  AND r.kind = 'database'
		ORDER BY d.resource_id DESC
	`

	rows, err := p.pool.Query(ctx, query, userID, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.DB, 0)
	for rows.Next() {
		var row model.DB
		if err := rows.Scan(&row.ResourceID, &row.Name, &row.NormalizedName, &row.Description); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return out, nil
}

func (p *PsqlDB) GetDatabase(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.DB, error) {
	const query = `
		SELECT d.resource_id, d.name, d.normalized_name, d.description
		FROM dbs d
		JOIN resources r ON r.id = d.resource_id
		JOIN projects p ON p.id = r.project_id
		WHERE p.user_id = $1
			AND p.id = $2
			AND r.id = $3
			AND r.kind = 'database'
	`

	var dbRow model.DB
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID).Scan(
		&dbRow.ResourceID,
		&dbRow.Name,
		&dbRow.NormalizedName,
		&dbRow.Description,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DB{}, ErrResourceNotFound
		}
		return model.DB{}, err
	}

	return dbRow, nil
}

func (p *PsqlDB) UpdateDatabase(ctx context.Context, userID uuid.UUID, projectID string, resourceID string, name *string, description *string) (model.DB, error) {
	const query = `
		WITH updated_db AS (
			UPDATE dbs d
			SET
				name = COALESCE($4, d.name),
				description = COALESCE($5, d.description)
			FROM resources r
			INNER JOIN projects p ON p.id = r.project_id
			WHERE d.resource_id = r.id
			  AND r.id = $3
			  AND r.project_id = $2
			  AND p.user_id = $1
			  AND r.kind = 'database'
			RETURNING d.resource_id, d.name, d.normalized_name, d.description
		),
		updated_resource AS (
			UPDATE resources r
			SET updated_at = NOW()
			FROM updated_db ud
			WHERE r.id = ud.resource_id
			RETURNING r.id
		)
		SELECT ud.resource_id, ud.name, ud.normalized_name, ud.description
		FROM updated_db ud
	`

	var row model.DB
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID, name, description).Scan(
		&row.ResourceID,
		&row.Name,
		&row.NormalizedName,
		&row.Description,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DB{}, ErrResourceNotFound
		}
		return model.DB{}, err
	}

	return row, nil
}

func (p *PsqlDB) GetDatabaseSecret(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.Secret, error) {
	// target_db CTE first resolves the exact database
	// then it scans secret resources in that same project
	// it requires the same tag id to be attached to both secret and database via resource_tags
	// it keeps strict tag checks: tag_key and tag_value
	const query = `
		WITH target_db AS (
			SELECT r.id, r.project_id
			FROM resources r
			INNER JOIN projects p ON p.id = r.project_id
			WHERE p.user_id = $1
			  AND p.id = $2
			  AND r.id = $3
			  AND r.kind = 'database'
		)
		SELECT
			s.resource_id,
			s.name,
			s.description,
			s.secret_value_hash,
			s.revealed_at,
			COUNT(*) OVER() AS total_matches
		FROM target_db db
		INNER JOIN resources rs
			ON rs.project_id = db.project_id
		   AND rs.kind = 'secret'
		INNER JOIN secrets s ON s.resource_id = rs.id
		INNER JOIN resource_tags rs_rt
			ON rs_rt.project_id = rs.project_id
		   AND rs_rt.resource_id = rs.id
		INNER JOIN resource_tags db_rt
			ON db_rt.project_id = db.project_id
		   AND db_rt.resource_id = db.id
		   AND db_rt.tag_id = rs_rt.tag_id
		INNER JOIN tags t
			ON t.id = rs_rt.tag_id
		   AND t.project_id = rs_rt.project_id
		WHERE t.tag_key = 'db_secret'
		  AND t.tag_value = CONCAT(db.id, '_', s.resource_id)
		  AND t.is_system = true
		ORDER BY s.resource_id DESC
		LIMIT 1
	`

	var secret model.Secret
	var totalMatches int
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID).Scan(
		&secret.ResourceID,
		&secret.Name,
		&secret.Description,
		&secret.SecretValueHash,
		&secret.RevealedAt,
		&totalMatches,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Secret{}, ErrResourceNotFound
		}
		return model.Secret{}, err
	}
	if totalMatches > 1 {
		return model.Secret{}, ErrMultipleResourceRows
	}

	return secret, nil
}

func (p *PsqlDB) CreateSecret(
	ctx context.Context,
	userID uuid.UUID,
	projectID string,
	name string,
	description *string,
	secretValueHash string,
) (model.Secret, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.Secret{}, err
	}
	defer tx.Rollback(ctx)

	const createResourceQuery = `
		INSERT INTO resources (project_id, kind)
		SELECT p.id, 'secret'
		FROM projects p
		WHERE p.id = $1
		  AND p.user_id = $2
		RETURNING id
	`

	var resourceID string
	if err := tx.QueryRow(ctx, createResourceQuery, projectID, userID).Scan(&resourceID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Secret{}, ErrProjectNotFound
		}
		return model.Secret{}, err
	}

	const createSecretQuery = `
		INSERT INTO secrets (resource_id, name, description, secret_value_hash)
		VALUES ($1, $2, $3, $4)
		RETURNING resource_id, name, description, secret_value_hash, revealed_at
	`

	var secret model.Secret
	if err := tx.QueryRow(ctx, createSecretQuery, resourceID, name, description, secretValueHash).Scan(
		&secret.ResourceID,
		&secret.Name,
		&secret.Description,
		&secret.SecretValueHash,
		&secret.RevealedAt,
	); err != nil {
		return model.Secret{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return model.Secret{}, err
	}

	return secret, nil
}

func (p *PsqlDB) ListSecrets(ctx context.Context, userID uuid.UUID, projectID string) ([]model.Secret, error) {
	const query = `
		SELECT s.resource_id, s.name, s.description, s.revealed_at
		FROM secrets s
		INNER JOIN resources r ON r.id = s.resource_id
		INNER JOIN projects p ON p.id = r.project_id
		WHERE p.user_id = $1
		  AND p.id = $2
		  AND r.kind = 'secret'
		ORDER BY s.resource_id DESC
	`

	rows, err := p.pool.Query(ctx, query, userID, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.Secret, 0)
	for rows.Next() {
		var row model.Secret
		if err := rows.Scan(&row.ResourceID, &row.Name, &row.Description, &row.RevealedAt); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return out, nil
}

func (p *PsqlDB) GetSecret(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.Secret, error) {
	const query = `
		SELECT s.resource_id, s.name, s.description, s.revealed_at
		FROM secrets s
		INNER JOIN resources r ON r.id = s.resource_id
		WHERE r.project_id = $1
		  AND s.resource_id = $2
		  AND r.kind = 'secret'
	`

	var secret model.Secret
	err := p.pool.QueryRow(ctx, query, projectID, resourceID).Scan(
		&secret.ResourceID,
		&secret.Name,
		&secret.Description,
		&secret.RevealedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Secret{}, ErrResourceNotFound
		}
		return model.Secret{}, err
	}
	return secret, nil
}

func (p *PsqlDB) RevealSecret(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.Secret, error) {
	const query = `
		UPDATE secrets s
		SET revealed_at = NOW()
		FROM resources r
		JOIN projects p ON p.id = r.project_id
		WHERE s.resource_id = r.id
		  AND r.id = $3
		  AND r.project_id = $2
		  AND p.user_id = $1
		  AND r.kind = 'secret'
		RETURNING
			s.resource_id,
			s.name,
			s.description,
			s.secret_value_hash,
			s.revealed_at
	`

	var secret model.Secret
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID).Scan(
		&secret.ResourceID,
		&secret.Name,
		&secret.Description,
		&secret.SecretValueHash,
		&secret.RevealedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Secret{}, ErrResourceNotFound
		}
		return model.Secret{}, err
	}

	return secret, nil
}

func (p *PsqlDB) UpdateSecretValue(ctx context.Context, userID uuid.UUID, projectID string, resourceID string, secretValueHash string) (model.Secret, error) {
	const query = `
		WITH updated_secret AS (
			UPDATE secrets s
			SET secret_value_hash = $4,
				revealed_at = NULL
			FROM resources r
			JOIN projects p ON p.id = r.project_id
			WHERE s.resource_id = r.id
			AND r.id = $3
			AND r.project_id = $2
			AND p.user_id = $1
			AND r.kind = 'secret'
			RETURNING s.resource_id, s.name, s.description, s.revealed_at
		),
		updated_resource AS (
			UPDATE resources r
			SET updated_at = NOW()
			FROM updated_secret us
			WHERE r.id = us.resource_id
			RETURNING r.id
		)
		SELECT us.resource_id, us.name, us.description, us.revealed_at
		FROM updated_secret us;
	`

	var secret model.Secret
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID, secretValueHash).Scan(
		&secret.ResourceID,
		&secret.Name,
		&secret.Description,
		&secret.RevealedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Secret{}, ErrResourceNotFound
		}
		return model.Secret{}, err
	}

	return secret, nil
}

func (p *PsqlDB) DeleteSecret(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) error {
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
		  AND s.resource_id = $2
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
		DELETE FROM resources r
		USING projects p
		WHERE r.project_id = p.id
		  AND p.user_id = $1
		  AND r.project_id = $2
		  AND r.id = $3
		  AND r.kind = 'secret'
	`
	cmd, err := tx.Exec(ctx, deleteResourceQuery, userID, projectID, deletedResourceID)
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

func (p *PsqlDB) ListProjectTags(ctx context.Context, userID uuid.UUID, projectID string) ([]model.Tag, error) {
	if _, err := p.GetProject(ctx, userID, projectID); err != nil {
		return nil, err
	}

	const query = `
		SELECT t.id, t.project_id, t.tag_key, t.tag_value, t.color, t.is_system
		FROM tags t
		INNER JOIN projects p ON p.id = t.project_id
		WHERE p.user_id = $1
		  AND p.id = $2
		ORDER BY t.tag_key, t.tag_value, t.id
	`

	rows, err := p.pool.Query(ctx, query, userID, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.Tag, 0)
	for rows.Next() {
		var row model.Tag
		if err := rows.Scan(&row.ID, &row.ProjectID, &row.TagKey, &row.TagValue, &row.Color, &row.IsSystem); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return out, nil
}

func (p *PsqlDB) ListResourceTags(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) ([]model.Tag, error) {
	if _, err := p.GetResource(ctx, userID, projectID, resourceID); err != nil {
		return nil, err
	}

	const query = `
		SELECT t.id, t.project_id, t.tag_key, t.tag_value, t.color, t.is_system
		FROM tags t
		INNER JOIN resource_tags rt ON rt.tag_id = t.id AND rt.project_id = t.project_id
		INNER JOIN projects p ON p.id = t.project_id AND p.user_id = $1
		WHERE rt.project_id = $2
		  AND rt.resource_id = $3
		ORDER BY t.tag_key, t.tag_value
	`

	rows, err := p.pool.Query(ctx, query, userID, projectID, resourceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.Tag, 0)
	for rows.Next() {
		var row model.Tag
		if err := rows.Scan(&row.ID, &row.ProjectID, &row.TagKey, &row.TagValue, &row.Color, &row.IsSystem); err != nil {
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
	userID uuid.UUID,
	projectID string,
	resourceID string,
	tagKey string,
	tagValue string,
	color *string,
	is_system bool,
) (model.Tag, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.Tag{}, err
	}
	defer tx.Rollback(ctx)

	const resolveQuery = `
		SELECT
			r.id AS resource_id,
			p.id AS project_id,
			t.id AS tag_id,
			t.tag_key,
			t.tag_value,
			t.color,
			t.is_system
		FROM resources r
		JOIN projects p ON p.id = r.project_id
		LEFT JOIN tags t
			ON t.project_id = p.id
		   AND t.tag_key = $4
		   AND t.tag_value = $5
		WHERE p.user_id = $1
		  AND p.id = $2
		  AND r.id = $3
		LIMIT 1
	`

	var resolvedResourceID string
	var resolvedProjectID string
	var existingTagID *int64
	var existingTagKey *string
	var existingTagValue *string
	var existingTagColor *string
	var existingTagIsSystem *bool

	err = tx.QueryRow(ctx, resolveQuery, userID, projectID, resourceID, tagKey, tagValue).Scan(
		&resolvedResourceID,
		&resolvedProjectID,
		&existingTagID,
		&existingTagKey,
		&existingTagValue,
		&existingTagColor,
		&existingTagIsSystem,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Tag{}, ErrResourceNotFound
		}
		return model.Tag{}, err
	}

	var tag model.Tag

	if existingTagID != nil {
		tag.ID = *existingTagID
		tag.ProjectID = resolvedProjectID
		if existingTagKey != nil {
			tag.TagKey = *existingTagKey
		}
		if existingTagValue != nil {
			tag.TagValue = *existingTagValue
		}
		tag.Color = existingTagColor
		if existingTagIsSystem != nil {
			tag.IsSystem = *existingTagIsSystem
		}
	} else {
		const createTagQuery = `
			INSERT INTO tags (project_id, tag_key, tag_value, color, is_system)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id, project_id, tag_key, tag_value, color, is_system
		`

		err = tx.QueryRow(ctx, createTagQuery, resolvedProjectID, tagKey, tagValue, color, is_system).Scan(
			&tag.ID,
			&tag.ProjectID,
			&tag.TagKey,
			&tag.TagValue,
			&tag.Color,
			&tag.IsSystem,
		)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				const getTagQuery = `
					SELECT id, project_id, tag_key, tag_value, color, is_system
					FROM tags
					WHERE project_id = $1
					  AND tag_key = $2
					  AND tag_value = $3
				`
				err = tx.QueryRow(ctx, getTagQuery, resolvedProjectID, tagKey, tagValue).Scan(
					&tag.ID,
					&tag.ProjectID,
					&tag.TagKey,
					&tag.TagValue,
					&tag.Color,
					&tag.IsSystem,
				)
				if err != nil {
					return model.Tag{}, err
				}
			} else {
				return model.Tag{}, err
			}
		}
	}

	const attachQuery = `
		INSERT INTO resource_tags (project_id, resource_id, tag_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (project_id, resource_id, tag_id) DO NOTHING
	`

	if _, err := tx.Exec(ctx, attachQuery, resolvedProjectID, resolvedResourceID, tag.ID); err != nil {
		return model.Tag{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return model.Tag{}, err
	}

	return tag, nil
}

func (p *PsqlDB) DetachResourceTag(ctx context.Context, userID uuid.UUID, projectID string, resourceID string, tagID int64) error {
	const query = `
		DELETE FROM resource_tags rt
		USING projects p, tags t
		WHERE p.id = rt.project_id
		  AND t.project_id = rt.project_id
		  AND t.id = rt.tag_id
		  AND p.user_id = $1
		  AND rt.project_id = $2
		  AND rt.resource_id = $3
		  AND rt.tag_id = $4
		  AND t.is_system = false
	`

	cmd, err := p.pool.Exec(ctx, query, userID, projectID, resourceID, tagID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrResourceTagNotFound
	}
	return nil
}
