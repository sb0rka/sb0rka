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

func (p *PsqlDB) CreateProject(ctx context.Context, userID uuid.UUID, name string, description string, isActive bool) (model.Project, error) {
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
			p.db_limit, p.code_limit, p.function_limit, p.secret_limit, p.project_limit, p.group_limit,
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
		&plan.CodeLimit,
		&plan.FunctionLimit,
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
			db_limit, code_limit, function_limit, secret_limit, project_limit, group_limit,
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
			&plan.CodeLimit,
			&plan.FunctionLimit,
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

func (p *PsqlDB) AssertCanCreateResourceWithType(ctx context.Context, userID uuid.UUID, projectID string, resourceType string) error {
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
	switch resourceType {
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
	case "code":
		maxLimitQuery = `
			SELECT COALESCE(MAX(p.code_limit), 0)
			FROM user_plans up
			INNER JOIN plans p ON p.id = up.plan_id
			WHERE up.user_id = $1
		`
	case "function":
		maxLimitQuery = `
			SELECT COALESCE(MAX(p.function_limit), 0)
			FROM user_plans up
			INNER JOIN plans p ON p.id = up.plan_id
			WHERE up.user_id = $1
		`
	default:
		return ErrInvalidResourceType
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
		  AND r.resource_type = $3
		  AND r.is_active = true
	`
	var n int64
	if err := p.pool.QueryRow(ctx, countQuery, userID, projectID, resourceType).Scan(&n); err != nil {
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
			r.is_active,
			r.resource_type,
			r.created_at,
			r.updated_at
		FROM resources r
		INNER JOIN projects p ON p.id = r.project_id
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
		if err := rows.Scan(
			&res.ID,
			&res.ProjectID,
			&res.IsActive,
			&res.ResourceType,
			&res.CreatedAt,
			&res.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, res)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return out, nil
}

func (p *PsqlDB) GetResource(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.Resource, error) {
	if _, err := p.GetProject(ctx, userID, projectID); err != nil {
		return model.Resource{}, err
	}

	const query = `
		SELECT id, project_id, is_active, resource_type, created_at, updated_at
		FROM resources
		WHERE project_id = $1 AND id = $2
	`

	var res model.Resource
	err := p.pool.QueryRow(ctx, query, projectID, resourceID).Scan(
		&res.ID,
		&res.ProjectID,
		&res.IsActive,
		&res.ResourceType,
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

func (p *PsqlDB) DeactivateResource(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.Resource, error) {
	const query = `
		UPDATE resources r
		SET is_active = false,
			updated_at = NOW()
		FROM projects p
		WHERE r.project_id = p.id
		  AND p.user_id = $1
		  AND r.project_id = $2
		  AND r.id = $3
		RETURNING r.id, r.project_id, r.is_active, r.resource_type, r.created_at, r.updated_at
	`

	var res model.Resource
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID).Scan(
		&res.ID,
		&res.ProjectID,
		&res.IsActive,
		&res.ResourceType,
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
		INSERT INTO resources (project_id, resource_type)
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
		INSERT INTO dbs (resource_id, name, normalized_name, description)
		VALUES ($1, $2, $3, $4)
		RETURNING resource_id, name, normalized_name, description, next_table_id
	`

	var dbRow model.DB
	if err := tx.QueryRow(ctx, createDBQuery, resourceID, name, normalizedName, description).Scan(
		&dbRow.ResourceID,
		&dbRow.Name,
		&dbRow.NormalizedName,
		&dbRow.Description,
		&dbRow.NextTableID,
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
		SELECT d.resource_id, d.name, d.normalized_name, d.description, d.next_table_id
		FROM dbs d
		INNER JOIN resources r ON r.id = d.resource_id
		INNER JOIN projects p ON p.id = r.project_id
		WHERE p.user_id = $1
		  AND p.id = $2
		  AND r.resource_type = 'database'
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
		if err := rows.Scan(&row.ResourceID, &row.Name, &row.NormalizedName, &row.Description, &row.NextTableID); err != nil {
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
		SELECT d.resource_id, d.name, d.normalized_name, d.description, d.next_table_id
		FROM dbs d
		JOIN resources r ON r.id = d.resource_id
		JOIN projects p ON p.id = r.project_id
		WHERE p.user_id = $1
			AND p.id = $2
			AND r.id = $3
			AND r.resource_type = 'database'
	`

	var dbRow model.DB
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID).Scan(
		&dbRow.ResourceID,
		&dbRow.Name,
		&dbRow.NormalizedName,
		&dbRow.Description,
		&dbRow.NextTableID,
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
			  AND r.resource_type = 'database'
			RETURNING d.resource_id, d.name, d.normalized_name, d.description, d.next_table_id
		),
		updated_resource AS (
			UPDATE resources r
			SET updated_at = NOW()
			FROM updated_db ud
			WHERE r.id = ud.resource_id
			RETURNING r.id
		)
		SELECT ud.resource_id, ud.name, ud.normalized_name, ud.description, ud.next_table_id
		FROM updated_db ud
	`

	var row model.DB
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID, name, description).Scan(
		&row.ResourceID,
		&row.Name,
		&row.NormalizedName,
		&row.Description,
		&row.NextTableID,
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
	const query = `
		SELECT
			s.resource_id,
			s.name,
			s.description,
			s.secret_value_hash,
			s.revealed_at,
			COUNT(*) OVER() AS total_matches
		FROM secrets s
		INNER JOIN resources rs ON rs.id = s.resource_id
		INNER JOIN projects p ON p.id = rs.project_id
		INNER JOIN resource_tags rt ON rt.project_id = rs.project_id AND rt.resource_id = rs.id
		INNER JOIN tags t ON t.id = rt.tag_id AND t.project_id = rt.project_id
		INNER JOIN resources db_r
			ON db_r.id = $3
		   AND db_r.project_id = p.id
		   AND db_r.resource_type = 'database'
		WHERE p.user_id = $1
		  AND p.id = $2
		  AND rs.resource_type = 'secret'
		  AND t.tag_key = 'db_id'
		  AND t.tag_value = db_r.id
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

func (p *PsqlDB) CreateDatabaseTable(ctx context.Context, userID uuid.UUID, projectID string, resourceID string, name string, description *string) (model.DBTable, error) {
	const query = `
		WITH bumped_db AS (
			UPDATE dbs d
			SET next_table_id = d.next_table_id + 1
			FROM resources r
			JOIN projects p ON p.id = r.project_id
			WHERE d.resource_id = r.id
			  AND p.user_id = $1
			  AND p.id = $2
			  AND d.resource_id = $3
			  AND r.resource_type = 'database'
			RETURNING d.resource_id, d.next_table_id - 1 AS table_id
		)
		INSERT INTO db_tables (id, db_id, name, description)
		SELECT bd.table_id, bd.resource_id, $4, $5
		FROM bumped_db bd
		RETURNING id, db_id, name, description, next_column_id, created_at, updated_at
	`

	var table model.DBTable
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID, name, description).Scan(
		&table.ID,
		&table.DBID,
		&table.Name,
		&table.Description,
		&table.NextColumnID,
		&table.CreatedAt,
		&table.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DBTable{}, ErrResourceNotFound
		}
		return model.DBTable{}, err
	}

	return table, nil
}

func (p *PsqlDB) ListDatabaseTables(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) ([]model.DBTable, error) {
	const query = `
		SELECT
			t.id,
			t.db_id,
			t.name,
			t.description,
			t.next_column_id,
			t.created_at,
			t.updated_at
		FROM db_tables t
		INNER JOIN dbs d ON d.resource_id = t.db_id
		INNER JOIN resources r ON r.id = d.resource_id
		INNER JOIN projects p ON p.id = r.project_id
		WHERE p.user_id = $1
		  AND p.id = $2
		  AND d.resource_id = $3
		  AND r.resource_type = 'database'
		ORDER BY t.created_at DESC
	`

	rows, err := p.pool.Query(ctx, query, userID, projectID, resourceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.DBTable, 0)
	for rows.Next() {
		var row model.DBTable
		if err := rows.Scan(
			&row.ID,
			&row.DBID,
			&row.Name,
			&row.Description,
			&row.NextColumnID,
			&row.CreatedAt,
			&row.UpdatedAt,
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

func (p *PsqlDB) GetDatabaseTable(ctx context.Context, userID uuid.UUID, projectID string, resourceID string, tableID int64) (model.DBTable, error) {
	const query = `
		SELECT
			t.id,
			t.db_id,
			t.name,
			t.description,
			t.next_column_id,
			t.created_at,
			t.updated_at
		FROM db_tables t
		INNER JOIN dbs d ON d.resource_id = t.db_id
		INNER JOIN resources r ON r.id = d.resource_id
		INNER JOIN projects p ON p.id = r.project_id
		WHERE p.user_id = $1
		  AND p.id = $2
		  AND d.resource_id = $3
		  AND r.resource_type = 'database'
		  AND t.id = $4
	`

	var row model.DBTable
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID, tableID).Scan(
		&row.ID,
		&row.DBID,
		&row.Name,
		&row.Description,
		&row.NextColumnID,
		&row.CreatedAt,
		&row.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DBTable{}, ErrResourceNotFound
		}
		return model.DBTable{}, err
	}

	return row, nil
}

func (p *PsqlDB) UpdateDatabaseTable(ctx context.Context, userID uuid.UUID, projectID string, resourceID string, tableID int64, name *string, description *string) (model.DBTable, error) {
	const query = `
		UPDATE db_tables t
		SET
			name = COALESCE($5, t.name),
			description = COALESCE($6, t.description),
			updated_at = NOW()
		FROM dbs d
		INNER JOIN resources r ON r.id = d.resource_id
		INNER JOIN projects p ON p.id = r.project_id
		WHERE t.db_id = d.resource_id
		  AND t.id = $4
		  AND p.user_id = $1
		  AND p.id = $2
		  AND d.resource_id = $3
		  AND r.resource_type = 'database'
		RETURNING t.id, t.db_id, t.name, t.description, t.next_column_id, t.created_at, t.updated_at
	`

	var row model.DBTable
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID, tableID, name, description).Scan(
		&row.ID,
		&row.DBID,
		&row.Name,
		&row.Description,
		&row.NextColumnID,
		&row.CreatedAt,
		&row.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DBTable{}, ErrResourceNotFound
		}
		return model.DBTable{}, err
	}

	return row, nil
}

func (p *PsqlDB) DeleteDatabaseTable(ctx context.Context, userID uuid.UUID, projectID string, resourceID string, tableID int64) error {
	const query = `
		DELETE FROM db_tables t
		USING dbs d, resources r, projects p
		WHERE t.db_id = d.resource_id
		  AND d.resource_id = r.id
		  AND r.project_id = p.id
		  AND p.user_id = $1
		  AND p.id = $2
		  AND d.resource_id = $3
		  AND r.resource_type = 'database'
		  AND t.id = $4
	`

	cmd, err := p.pool.Exec(ctx, query, userID, projectID, resourceID, tableID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrResourceNotFound
	}
	return nil
}

func (p *PsqlDB) CreateDatabaseColumn(ctx context.Context, userID uuid.UUID, projectID string, resourceID string, tableID int64, name string, dataType string, isPrimaryKey bool, isNullable bool, isUnique bool, isArray bool, defaultValue *string, foreignKey *string) (model.DBTableColumn, error) {
	const query = `
		WITH bumped_table AS (
			UPDATE db_tables t
			SET next_column_id = t.next_column_id + 1
			FROM dbs d
			INNER JOIN resources r ON r.id = d.resource_id
			INNER JOIN projects p ON p.id = r.project_id
			WHERE t.db_id = d.resource_id
			  AND t.id = $4
			  AND p.user_id = $1
			  AND p.id = $2
			  AND d.resource_id = $3
			  AND r.resource_type = 'database'
			RETURNING t.id AS table_id, t.db_id, t.next_column_id - 1 AS column_id
		)
		INSERT INTO db_table_columns (
			id, table_id, db_id, name, data_type,
			is_primary_key, is_nullable, is_unique, is_array,
			default_value, foreign_key
		)
		SELECT
			bt.column_id,
			bt.table_id,
			bt.db_id,
			$5,
			$6,
			$7,
			$8,
			$9,
			$10,
			$11,
			$12
		FROM bumped_table bt
		RETURNING
			id, table_id, db_id, name, data_type,
			is_primary_key, is_nullable, is_unique, is_array,
			default_value, foreign_key,
			created_at, updated_at
	`

	var col model.DBTableColumn
	err := p.pool.QueryRow(ctx, query,
		userID, projectID, resourceID, tableID,
		name, dataType, isPrimaryKey, isNullable, isUnique, isArray, defaultValue, foreignKey,
	).Scan(
		&col.ID,
		&col.TableID,
		&col.DBID,
		&col.Name,
		&col.DataType,
		&col.IsPrimaryKey,
		&col.IsNullable,
		&col.IsUnique,
		&col.IsArray,
		&col.DefaultValue,
		&col.ForeignKey,
		&col.CreatedAt,
		&col.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DBTableColumn{}, ErrResourceNotFound
		}
		return model.DBTableColumn{}, err
	}

	return col, nil
}

func (p *PsqlDB) ListDatabaseColumns(ctx context.Context, userID uuid.UUID, projectID string, resourceID string, tableID int64) ([]model.DBTableColumn, error) {
	const query = `
		SELECT
			c.id,
			c.table_id,
			c.db_id,
			c.name,
			c.data_type,
			c.is_primary_key,
			c.is_nullable,
			c.is_unique,
			c.is_array,
			c.default_value,
			c.foreign_key,
			c.created_at,
			c.updated_at
		FROM db_table_columns c
		INNER JOIN db_tables t ON t.id = c.table_id
		INNER JOIN dbs d ON d.resource_id = t.db_id
		INNER JOIN resources r ON r.id = d.resource_id
		INNER JOIN projects p ON p.id = r.project_id
		WHERE p.user_id = $1
		  AND p.id = $2
		  AND d.resource_id = $3
		  AND r.resource_type = 'database'
		  AND t.id = $4
		ORDER BY c.created_at DESC
	`

	rows, err := p.pool.Query(ctx, query, userID, projectID, resourceID, tableID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.DBTableColumn, 0)
	for rows.Next() {
		var row model.DBTableColumn
		if err := rows.Scan(
			&row.ID,
			&row.TableID,
			&row.DBID,
			&row.Name,
			&row.DataType,
			&row.IsPrimaryKey,
			&row.IsNullable,
			&row.IsUnique,
			&row.IsArray,
			&row.DefaultValue,
			&row.ForeignKey,
			&row.CreatedAt,
			&row.UpdatedAt,
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

func (p *PsqlDB) GetDatabaseColumn(ctx context.Context, userID uuid.UUID, projectID string, resourceID string, tableID int64, columnID int64) (model.DBTableColumn, error) {
	const query = `
		SELECT
			c.id,
			c.table_id,
			c.db_id,
			c.name,
			c.data_type,
			c.is_primary_key,
			c.is_nullable,
			c.is_unique,
			c.is_array,
			c.default_value,
			c.foreign_key,
			c.created_at,
			c.updated_at
		FROM db_table_columns c
		INNER JOIN db_tables t ON t.id = c.table_id
		INNER JOIN dbs d ON d.resource_id = t.db_id
		INNER JOIN resources r ON r.id = d.resource_id
		INNER JOIN projects p ON p.id = r.project_id
		WHERE p.user_id = $1
		  AND p.id = $2
		  AND d.resource_id = $3
		  AND r.resource_type = 'database'
		  AND t.id = $4
		  AND c.id = $5
	`

	var row model.DBTableColumn
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID, tableID, columnID).Scan(
		&row.ID,
		&row.TableID,
		&row.DBID,
		&row.Name,
		&row.DataType,
		&row.IsPrimaryKey,
		&row.IsNullable,
		&row.IsUnique,
		&row.IsArray,
		&row.DefaultValue,
		&row.ForeignKey,
		&row.CreatedAt,
		&row.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DBTableColumn{}, ErrResourceNotFound
		}
		return model.DBTableColumn{}, err
	}

	return row, nil
}

func (p *PsqlDB) UpdateDatabaseColumn(ctx context.Context, userID uuid.UUID, projectID string, resourceID string, tableID int64, columnID int64, name string) (model.DBTableColumn, error) {
	const query = `
		UPDATE db_table_columns c
		SET
			name = COALESCE($6, c.name),
			updated_at = NOW()
		FROM db_tables t
		INNER JOIN dbs d ON d.resource_id = t.db_id
		INNER JOIN resources r ON r.id = d.resource_id
		INNER JOIN projects p ON p.id = r.project_id
		WHERE c.table_id = t.id
		  AND c.id = $5
		  AND p.user_id = $1
		  AND p.id = $2
		  AND d.resource_id = $3
		  AND r.resource_type = 'database'
		  AND t.id = $4
		RETURNING
			c.id,
			c.table_id,
			c.db_id,
			c.name,
			c.data_type,
			c.is_primary_key,
			c.is_nullable,
			c.is_unique,
			c.is_array,
			c.default_value,
			c.foreign_key,
			c.created_at,
			c.updated_at
	`

	var row model.DBTableColumn
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID, tableID, columnID, name).Scan(
		&row.ID,
		&row.TableID,
		&row.DBID,
		&row.Name,
		&row.DataType,
		&row.IsPrimaryKey,
		&row.IsNullable,
		&row.IsUnique,
		&row.IsArray,
		&row.DefaultValue,
		&row.ForeignKey,
		&row.CreatedAt,
		&row.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DBTableColumn{}, ErrResourceNotFound
		}
		return model.DBTableColumn{}, err
	}

	return row, nil
}

func (p *PsqlDB) DeleteDatabaseColumn(ctx context.Context, userID uuid.UUID, projectID string, resourceID string, tableID int64, columnID int64) error {
	const query = `
		DELETE FROM db_table_columns c
		USING db_tables t, dbs d, resources r, projects p
		WHERE c.table_id = t.id
		  AND t.db_id = d.resource_id
		  AND d.resource_id = r.id
		  AND r.project_id = p.id
		  AND p.user_id = $1
		  AND p.id = $2
		  AND d.resource_id = $3
		  AND r.resource_type = 'database'
		  AND t.id = $4
		  AND c.id = $5
	`

	cmd, err := p.pool.Exec(ctx, query, userID, projectID, resourceID, tableID, columnID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrResourceNotFound
	}
	return nil
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
		INSERT INTO resources (project_id, resource_type)
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
		  AND r.resource_type = 'secret'
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
		  AND r.resource_type = 'secret'
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
			AND r.resource_type = 'secret'
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

func (p *PsqlDB) DeleteResourceTag(ctx context.Context, userID uuid.UUID, projectID string, resourceID string, tagID int64) error {
	if _, err := p.GetResource(ctx, userID, projectID, resourceID); err != nil {
		return err
	}

	const query = `
		DELETE FROM resource_tags rt
		USING projects p
		WHERE p.id = rt.project_id
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
