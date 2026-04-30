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

func (p *PsqlDB) CreateDatabase(ctx context.Context, userID uuid.UUID, projectID string, name string, normalizedName string, description *string, encryptedValue string, passwordVerifier string) (model.DB, model.Secret, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.DB{}, model.Secret{}, err
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
			return model.DB{}, model.Secret{}, ErrProjectNotFound
		}
		return model.DB{}, model.Secret{}, err
	}

	const createDBQuery = `
		INSERT INTO dbs (project_id, resource_id, name, normalized_name, desired_runtime_state, description)
		VALUES ($1, $2, $3, $4, 'running', $5)
		RETURNING resource_id, name, normalized_name, desired_runtime_state, description
	`

	var dbRow model.DB
	if err := tx.QueryRow(ctx, createDBQuery, projectID, resourceID, name, normalizedName, description).Scan(
		&dbRow.ResourceID,
		&dbRow.Name,
		&dbRow.NormalizedName,
		&dbRow.DesiredRuntimeState,
		&dbRow.Description,
	); err != nil {
		return model.DB{}, model.Secret{}, err
	}

	const createSecretResourceQuery = `
		INSERT INTO resources (project_id, kind)
		SELECT p.id, 'secret'
		FROM projects p
		WHERE p.id = $1
		  AND p.user_id = $2
		RETURNING id
	`

	var secretResourceID string
	if err := tx.QueryRow(ctx, createSecretResourceQuery, projectID, userID).Scan(&secretResourceID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DB{}, model.Secret{}, ErrProjectNotFound
		}
		return model.DB{}, model.Secret{}, err
	}

	secretName := DatabasePasswordSecretName(dbRow.ResourceID)
	secretDescription := DatabasePasswordSecretDescription(dbRow.Name, dbRow.ResourceID)

	const createSecretQuery = `
		INSERT INTO secrets (project_id, resource_id, name, description, encrypted_value, version)
		VALUES ($1, $2, $3, $4, $5, 1)
		RETURNING resource_id, name, description, encrypted_value, version, revealed_at
	`

	var secret model.Secret
	if err := tx.QueryRow(ctx, createSecretQuery, projectID, secretResourceID, secretName, &secretDescription, encryptedValue).Scan(
		&secret.ResourceID,
		&secret.Name,
		&secret.Description,
		&secret.EncryptedValue,
		&secret.Version,
		&secret.RevealedAt,
	); err != nil {
		return model.DB{}, model.Secret{}, err
	}

	const createDBVerifierQuery = `
		INSERT INTO db_verifiers (project_id, db_id, password_secret_id, password_verifier, password_desired_version, password_desired_state)
		VALUES ($1, $2, $3, $4, $5, 'present')
	`

	if _, err := tx.Exec(ctx, createDBVerifierQuery, projectID, dbRow.ResourceID, secret.ResourceID, passwordVerifier, secret.Version); err != nil {
		return model.DB{}, model.Secret{}, err
	}

	tagKey, tagValue := DatabaseSecretTag(dbRow.ResourceID, secret.ResourceID)
	const createTagQuery = `
		INSERT INTO tags (project_id, tag_key, tag_value, color, is_system, is_readonly)
		VALUES ($1, $2, $3, NULL, true, true)
		RETURNING id
	`

	var tagID int64
	if err := tx.QueryRow(ctx, createTagQuery, projectID, tagKey, tagValue).Scan(&tagID); err != nil {
		return model.DB{}, model.Secret{}, err
	}

	const attachTagQuery = `
		INSERT INTO resource_tags (project_id, resource_id, tag_id)
		VALUES ($1, $2, $3)
	`

	if _, err := tx.Exec(ctx, attachTagQuery, projectID, dbRow.ResourceID, tagID); err != nil {
		return model.DB{}, model.Secret{}, err
	}
	if _, err := tx.Exec(ctx, attachTagQuery, projectID, secret.ResourceID, tagID); err != nil {
		return model.DB{}, model.Secret{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return model.DB{}, model.Secret{}, err
	}

	return dbRow, secret, nil
}

func (p *PsqlDB) ListDatabases(ctx context.Context, userID uuid.UUID, projectID string) ([]model.DB, error) {
	const query = `
		SELECT
			d.resource_id,
			d.name,
			d.normalized_name,
			d.desired_runtime_state,
			d.description,
			rs.runtime_state,
			rs.created_at,
			rs.updated_at
		FROM dbs d
		INNER JOIN resources r ON r.id = d.resource_id
		INNER JOIN projects p ON p.id = r.project_id
		LEFT JOIN resource_states rs ON rs.resource_id = r.id
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
		var runtimeState *string
		var stateCreatedAt *time.Time
		var stateUpdatedAt *time.Time
		if err := rows.Scan(
			&row.ResourceID,
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

func (p *PsqlDB) GetDatabase(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.DB, error) {
	const query = `
		SELECT
			d.resource_id,
			d.name,
			d.normalized_name,
			d.desired_runtime_state,
			d.description,
			rs.runtime_state,
			rs.created_at,
			rs.updated_at
		FROM dbs d
		JOIN resources r ON r.id = d.resource_id
		JOIN projects p ON p.id = r.project_id
		LEFT JOIN resource_states rs ON rs.resource_id = r.id
		WHERE p.user_id = $1
			AND p.id = $2
			AND r.id = $3
			AND r.kind = 'database'
	`

	var dbRow model.DB
	var runtimeState *string
	var stateCreatedAt *time.Time
	var stateUpdatedAt *time.Time
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID).Scan(
		&dbRow.ResourceID,
		&dbRow.Name,
		&dbRow.NormalizedName,
		&dbRow.DesiredRuntimeState,
		&dbRow.Description,
		&runtimeState,
		&stateCreatedAt,
		&stateUpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DB{}, ErrResourceNotFound
		}
		return model.DB{}, err
	}
	if runtimeState != nil && stateCreatedAt != nil && stateUpdatedAt != nil {
		dbRow.ResourceState = &model.ResourceState{
			ResourceID:   dbRow.ResourceID,
			RuntimeState: *runtimeState,
			CreatedAt:    *stateCreatedAt,
			UpdatedAt:    *stateUpdatedAt,
		}
	}

	const tagsQuery = `
		SELECT t.id, t.project_id, t.tag_key, t.tag_value, t.color, t.is_system, t.is_readonly
		FROM tags t
		INNER JOIN resource_tags rt ON rt.tag_id = t.id AND rt.project_id = t.project_id
		INNER JOIN projects p ON p.id = t.project_id AND p.user_id = $1
		WHERE rt.project_id = $2
		  AND rt.resource_id = $3
		ORDER BY t.tag_key, t.tag_value
	`

	rows, err := p.pool.Query(ctx, tagsQuery, userID, projectID, resourceID)
	if err != nil {
		return model.DB{}, err
	}
	defer rows.Close()

	dbRow.Tags = make([]model.Tag, 0)
	for rows.Next() {
		var tag model.Tag
		if err := rows.Scan(
			&tag.ID,
			&tag.ProjectID,
			&tag.TagKey,
			&tag.TagValue,
			&tag.Color,
			&tag.IsSystem,
			&tag.IsReadonly,
		); err != nil {
			return model.DB{}, err
		}
		dbRow.Tags = append(dbRow.Tags, tag)
	}
	if err := rows.Err(); err != nil {
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
			RETURNING d.resource_id, d.name, d.normalized_name, d.desired_runtime_state, d.description
		),
		updated_resource AS (
			UPDATE resources r
			SET updated_at = NOW()
			FROM updated_db ud
			WHERE r.id = ud.resource_id
			RETURNING r.id
		)
		SELECT ud.resource_id, ud.name, ud.normalized_name, ud.desired_runtime_state, ud.description
		FROM updated_db ud
	`

	var row model.DB
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID, name, description).Scan(
		&row.ResourceID,
		&row.Name,
		&row.NormalizedName,
		&row.DesiredRuntimeState,
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

func (p *PsqlDB) GetDatabaseConnParams(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.DB, model.Secret, error) {
	dbRow, err := p.GetDatabase(ctx, userID, projectID, resourceID)
	if err != nil {
		return model.DB{}, model.Secret{}, err
	}

	var matchedSecret *model.Secret
	for _, tag := range dbRow.Tags {
		tagKey, _ := DatabaseSecretTag(dbRow.ResourceID, "")
		if tag.TagKey != tagKey || !tag.IsSystem {
			continue
		}

		secrets, err := p.listSecretsByTagID(ctx, userID, projectID, tag.ID)
		if err != nil {
			return model.DB{}, model.Secret{}, err
		}
		for _, secret := range secrets {
			expectedTagKey, expectedTagValue := DatabaseSecretTag(dbRow.ResourceID, secret.ResourceID)
			if tag.TagKey != expectedTagKey || tag.TagValue != expectedTagValue {
				continue
			}
			if matchedSecret != nil {
				return model.DB{}, model.Secret{}, ErrMultipleResourceRows
			}
			secretCopy := secret
			matchedSecret = &secretCopy
		}
	}

	if matchedSecret == nil {
		return model.DB{}, model.Secret{}, ErrResourceNotFound
	}

	return dbRow, *matchedSecret, nil
}

func (p *PsqlDB) listSecretsByTagID(ctx context.Context, userID uuid.UUID, projectID string, tagID int64) ([]model.Secret, error) {
	const query = `
		SELECT
			s.resource_id,
			s.name,
			s.description,
			s.encrypted_value,
			s.version,
			s.revealed_at
		FROM resource_tags rt
		INNER JOIN projects p
			ON p.id = rt.project_id
		   AND p.user_id = $1
		INNER JOIN resources r
			ON r.id = rt.resource_id
		   AND r.project_id = rt.project_id
		   AND r.kind = 'secret'
		INNER JOIN secrets s ON s.resource_id = r.id
		WHERE rt.project_id = $2
		  AND rt.tag_id = $3
		ORDER BY s.resource_id DESC
	`

	rows, err := p.pool.Query(ctx, query, userID, projectID, tagID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]model.Secret, 0)
	for rows.Next() {
		var secret model.Secret
		if err := rows.Scan(
			&secret.ResourceID,
			&secret.Name,
			&secret.Description,
			&secret.EncryptedValue,
			&secret.Version,
			&secret.RevealedAt,
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

func (p *PsqlDB) ClaimDatabaseTermination(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) (model.DB, model.DBVerifier, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return model.DB{}, model.DBVerifier{}, err
	}
	defer tx.Rollback(ctx)

	const updateDBQuery = `
		UPDATE dbs d
		SET desired_runtime_state = 'terminated'
		FROM resources r
		INNER JOIN projects p ON p.id = r.project_id
		WHERE d.resource_id = r.id
		  AND d.resource_id = $3
		  AND d.project_id = $2
		  AND r.kind = 'database'
		  AND p.user_id = $1
		RETURNING d.resource_id, d.name, d.normalized_name, d.desired_runtime_state, d.description
	`

	var dbRow model.DB
	err = tx.QueryRow(ctx, updateDBQuery, userID, projectID, resourceID).Scan(
		&dbRow.ResourceID,
		&dbRow.Name,
		&dbRow.NormalizedName,
		&dbRow.DesiredRuntimeState,
		&dbRow.Description,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DB{}, model.DBVerifier{}, ErrResourceNotFound
		}
		return model.DB{}, model.DBVerifier{}, err
	}

	const updateVerifiersQuery = `
		UPDATE db_verifiers dv
		SET password_desired_state = 'absent'
		FROM projects p
		WHERE dv.project_id = p.id
		  AND p.user_id = $1
		  AND dv.project_id = $2
		  AND dv.db_id = $3
		RETURNING dv.project_id, dv.db_id, dv.password_secret_id, dv.password_verifier, dv.password_desired_version, dv.password_desired_state
	`

	var dbVerifier model.DBVerifier
	err = tx.QueryRow(ctx, updateVerifiersQuery, userID, projectID, dbRow.ResourceID).Scan(
		&dbVerifier.ProjectID,
		&dbVerifier.DBID,
		&dbVerifier.PasswordSecretID,
		&dbVerifier.PasswordVerifier,
		&dbVerifier.PasswordDesiredVersion,
		&dbVerifier.PasswordDesiredState,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.DB{}, model.DBVerifier{}, ErrResourceNotFound
		}
		return model.DB{}, model.DBVerifier{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return model.DB{}, model.DBVerifier{}, err
	}

	return dbRow, dbVerifier, nil
}

func (p *PsqlDB) CreateSecret(
	ctx context.Context,
	userID uuid.UUID,
	projectID string,
	name string,
	description *string,
	encryptedValue string,
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
		INSERT INTO secrets (project_id, resource_id, name, description, encrypted_value, version)
		VALUES ($1, $2, $3, $4, $5, 1)
		RETURNING resource_id, name, description, encrypted_value, version, revealed_at
	`

	var secret model.Secret
	if err := tx.QueryRow(ctx, createSecretQuery, projectID, resourceID, name, description, encryptedValue).Scan(
		&secret.ResourceID,
		&secret.Name,
		&secret.Description,
		&secret.EncryptedValue,
		&secret.Version,
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
		SELECT s.resource_id, s.name, s.description, s.version, s.revealed_at
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
		if err := rows.Scan(&row.ResourceID, &row.Name, &row.Description, &row.Version, &row.RevealedAt); err != nil {
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
		SELECT
			s.resource_id,
			s.name,
			s.description,
			s.version,
			s.revealed_at,
			rs.runtime_state,
			rs.created_at,
			rs.updated_at
		FROM secrets s
		INNER JOIN resources r ON r.id = s.resource_id
		INNER JOIN projects p ON p.id = r.project_id
		LEFT JOIN resource_states rs ON rs.resource_id = r.id
		WHERE p.user_id = $1
		  AND p.id = $2
		  AND s.resource_id = $3
		  AND r.kind = 'secret'
	`

	var secret model.Secret
	var runtimeState *string
	var stateCreatedAt *time.Time
	var stateUpdatedAt *time.Time
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID).Scan(
		&secret.ResourceID,
		&secret.Name,
		&secret.Description,
		&secret.Version,
		&secret.RevealedAt,
		&runtimeState,
		&stateCreatedAt,
		&stateUpdatedAt,
	)
	if err != nil {
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

	const tagsQuery = `
		SELECT t.id, t.project_id, t.tag_key, t.tag_value, t.color, t.is_system, t.is_readonly
		FROM tags t
		INNER JOIN resource_tags rt ON rt.tag_id = t.id AND rt.project_id = t.project_id
		INNER JOIN projects p ON p.id = t.project_id AND p.user_id = $1
		WHERE rt.project_id = $2
		  AND rt.resource_id = $3
		ORDER BY t.tag_key, t.tag_value
	`

	rows, err := p.pool.Query(ctx, tagsQuery, userID, projectID, resourceID)
	if err != nil {
		return model.Secret{}, err
	}
	defer rows.Close()

	secret.Tags = make([]model.Tag, 0)
	for rows.Next() {
		var tag model.Tag
		if err := rows.Scan(
			&tag.ID,
			&tag.ProjectID,
			&tag.TagKey,
			&tag.TagValue,
			&tag.Color,
			&tag.IsSystem,
			&tag.IsReadonly,
		); err != nil {
			return model.Secret{}, err
		}
		secret.Tags = append(secret.Tags, tag)
	}
	if err := rows.Err(); err != nil {
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
			s.encrypted_value,
			s.version,
			s.revealed_at
	`

	var secret model.Secret
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID).Scan(
		&secret.ResourceID,
		&secret.Name,
		&secret.Description,
		&secret.EncryptedValue,
		&secret.Version,
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

func (p *PsqlDB) UpdateSecretValue(ctx context.Context, userID uuid.UUID, projectID string, resourceID string, encryptedValue string) (model.Secret, error) {
	const query = `
		WITH updated_secret AS (
			UPDATE secrets s
			SET encrypted_value = $4,
				revealed_at = NULL
			FROM resources r
			JOIN projects p ON p.id = r.project_id
			WHERE s.resource_id = r.id
			AND r.id = $3
			AND r.project_id = $2
			AND p.user_id = $1
			AND r.kind = 'secret'
			RETURNING s.resource_id, s.name, s.description, s.version, s.revealed_at
		),
		updated_resource AS (
			UPDATE resources r
			SET updated_at = NOW()
			FROM updated_secret us
			WHERE r.id = us.resource_id
			RETURNING r.id
		)
		SELECT us.resource_id, us.name, us.description, us.version, us.revealed_at
		FROM updated_secret us;
	`

	var secret model.Secret
	err := p.pool.QueryRow(ctx, query, userID, projectID, resourceID, encryptedValue).Scan(
		&secret.ResourceID,
		&secret.Name,
		&secret.Description,
		&secret.Version,
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
		SELECT t.id, t.project_id, t.tag_key, t.tag_value, t.color, t.is_system, t.is_readonly
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

func (p *PsqlDB) ListResourceTags(ctx context.Context, userID uuid.UUID, projectID string, resourceID string) ([]model.Tag, error) {
	if _, err := p.GetResource(ctx, userID, projectID, resourceID); err != nil {
		return nil, err
	}

	const query = `
		SELECT t.id, t.project_id, t.tag_key, t.tag_value, t.color, t.is_system, t.is_readonly
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
	userID uuid.UUID,
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

	const resolveQuery = `
		SELECT
			r.id AS resource_id,
			p.id AS project_id,
			t.id AS tag_id,
			t.tag_key,
			t.tag_value,
			t.color,
			t.is_system,
			t.is_readonly
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
	var existingTagIsReadonly *bool

	err = tx.QueryRow(ctx, resolveQuery, userID, projectID, resourceID, tagKey, tagValue).Scan(
		&resolvedResourceID,
		&resolvedProjectID,
		&existingTagID,
		&existingTagKey,
		&existingTagValue,
		&existingTagColor,
		&existingTagIsSystem,
		&existingTagIsReadonly,
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
		if existingTagIsReadonly != nil {
			tag.IsReadonly = *existingTagIsReadonly
		}
		if tag.IsSystem || tag.IsReadonly {
			return model.Tag{}, ErrResourceTagImmutable
		}
	} else {
		const createTagQuery = `
			INSERT INTO tags (project_id, tag_key, tag_value, color)
			VALUES ($1, $2, $3, $4)
			RETURNING id, project_id, tag_key, tag_value, color, is_system, is_readonly
		`

		err = tx.QueryRow(ctx, createTagQuery, resolvedProjectID, tagKey, tagValue, color).Scan(
			&tag.ID,
			&tag.ProjectID,
			&tag.TagKey,
			&tag.TagValue,
			&tag.Color,
			&tag.IsSystem,
			&tag.IsReadonly,
		)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" {
				const getTagQuery = `
					SELECT id, project_id, tag_key, tag_value, color, is_system, is_readonly
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
					&tag.IsReadonly,
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
		  AND t.is_readonly = false
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
