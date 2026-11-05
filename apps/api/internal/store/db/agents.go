package db

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/sb0rka/sb0rka/apps/api/internal/domain/model"
)

// JoinProjectAsAgent adds the agent when a secret in the project is already bound to it.
// A repeated join returns the existing membership.
func (p *PsqlDB) JoinProjectAsAgent(ctx context.Context, projectPublicID string, agentSubjectID uuid.UUID) (model.ProjectMember, error) {
	var projectID uuid.UUID
	err := p.pool.QueryRow(ctx, `SELECT id FROM projects WHERE public_id = $1`, projectPublicID).Scan(&projectID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.ProjectMember{}, ErrProjectNotFound
		}
		return model.ProjectMember{}, err
	}
	const query = `
		INSERT INTO project_members (project_id, subject_id, role)
		SELECT $1, $2, 'agent'
		WHERE EXISTS (
			SELECT 1 FROM secret_agent_keys
			WHERE project_id = $1 AND agent_subject_id = $2
		)
		ON CONFLICT (project_id, subject_id) DO NOTHING
		RETURNING project_id, subject_id, role, created_at, updated_at
	`
	var out model.ProjectMember
	err = p.pool.QueryRow(ctx, query, projectID, agentSubjectID).Scan(
		&out.ProjectID, &out.SubjectID, &out.Role, &out.CreatedAt, &out.UpdatedAt,
	)
	if err == nil {
		return out, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return model.ProjectMember{}, err
	}
	existing, getErr := p.GetProjectMember(ctx, projectID, agentSubjectID)
	if getErr == nil {
		return existing, nil
	}
	if errors.Is(getErr, ErrProjectMemberNotFound) {
		return model.ProjectMember{}, ErrAgentNotInvited
	}
	return model.ProjectMember{}, getErr
}

func (p *PsqlDB) IsProjectAgent(ctx context.Context, projectID, agentSubjectID uuid.UUID) (bool, error) {
	var member bool
	err := p.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM project_members
			WHERE project_id = $1 AND subject_id = $2 AND role = 'agent'
		)`, projectID, agentSubjectID).Scan(&member)
	return member, err
}

func (p *PsqlDB) GrantSecretAgent(ctx context.Context, projectID uuid.UUID, secretPublicID string, agentSubjectID uuid.UUID) error {
	tag, err := p.pool.Exec(ctx, `
		INSERT INTO secret_agent_keys (project_id, secret_id, agent_subject_id)
		SELECT r.project_id, r.id, $3
		FROM resources r
		WHERE r.project_id = $1 AND r.public_id = $2 AND r.kind = 'secret'
		ON CONFLICT (secret_id, agent_subject_id) DO NOTHING`,
		projectID, secretPublicID, agentSubjectID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		var exists bool
		err = p.pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM secret_agent_keys k
				JOIN resources r ON r.id = k.secret_id AND r.project_id = k.project_id
				WHERE r.project_id = $1 AND r.public_id = $2 AND k.agent_subject_id = $3
			)`, projectID, secretPublicID, agentSubjectID).Scan(&exists)
		if err != nil {
			return err
		}
		if exists {
			return nil
		}
		return ErrResourceNotFound
	}
	return nil
}

func (p *PsqlDB) RevokeSecretAgent(ctx context.Context, projectID uuid.UUID, secretPublicID string, agentSubjectID uuid.UUID) error {
	tag, err := p.pool.Exec(ctx, `
		DELETE FROM secret_agent_keys k
		USING resources r
		WHERE r.id = k.secret_id AND r.project_id = k.project_id
		  AND r.project_id = $1 AND r.public_id = $2 AND r.kind = 'secret'
		  AND k.agent_subject_id = $3`,
		projectID, secretPublicID, agentSubjectID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrResourceNotFound
	}
	return nil
}

func (p *PsqlDB) ListSecretAgentIDs(ctx context.Context, projectID, secretID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT agent_subject_id FROM secret_agent_keys
		WHERE project_id = $1 AND secret_id = $2
		ORDER BY agent_subject_id`, projectID, secretID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (p *PsqlDB) IsLiveAgent(ctx context.Context, subjectID, hostID uuid.UUID) (bool, error) {
	var live bool
	err := p.pool.QueryRow(ctx, `SELECT auth.is_live_agent($1, $2)`, subjectID, hostID).Scan(&live)
	return live, err
}

func (p *PsqlDB) AgentOwnedByUser(ctx context.Context, agentSubjectID, actorSubjectID, userSubjectID uuid.UUID) (bool, error) {
	var owned bool
	err := p.pool.QueryRow(ctx, `SELECT auth.is_agent_of_user($1, $2, $3)`, agentSubjectID, actorSubjectID, userSubjectID).Scan(&owned)
	return owned, err
}

func (p *PsqlDB) SecretBoundToAgent(ctx context.Context, project, resource, agent string) (bool, error) {
	var bound bool
	err := p.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM secret_agent_keys k
			JOIN resources r ON r.id = k.secret_id AND r.project_id = k.project_id
			JOIN projects p ON p.id = r.project_id
			WHERE p.public_id = $1
			  AND r.public_id = $2
			  AND r.kind = 'secret'
			  AND k.agent_subject_id = $3::uuid
		)`,
		project, resource, agent,
	).Scan(&bound)
	return bound, err
}

func (p *PsqlDB) ListAgentSecretIDs(ctx context.Context, project, agent string) ([]string, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT r.public_id
		FROM secret_agent_keys k
		JOIN resources r ON r.id = k.secret_id AND r.project_id = k.project_id
		JOIN projects p ON p.id = r.project_id
		WHERE p.public_id = $1
		  AND r.kind = 'secret'
		  AND k.agent_subject_id = $2::uuid`,
		project, agent,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
