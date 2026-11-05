package db

import (
	"context"
)

// LiveDelegation reports whether the delegation grant behind a delegated token
// is still active at the version recorded in the token.
func (p *PsqlDB) LiveDelegation(ctx context.Context, id string, version int64, user, client, actor string, scopes, projects []string, audience string) (bool, error) {
	var live bool
	err := p.pool.QueryRow(ctx, `SELECT auth.is_live_delegation($1, $2, $3, $4, $5, $6, $7, $8)`,
		id, version, user, client, actor, scopes, projects, audience,
	).Scan(&live)
	return live, err
}

// SecretBoundToUserAgent reports whether the secret is a key of an agent owned by this user and attested by this actor.
func (p *PsqlDB) SecretBoundToUserAgent(ctx context.Context, project, resource, actor, user string) (bool, error) {
	var allowed bool
	err := p.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM secret_agent_keys k
			JOIN resources r ON r.id = k.secret_id AND r.project_id = k.project_id
			JOIN projects p ON p.id = r.project_id
			WHERE p.public_id = $1
			  AND r.public_id = $2
			  AND r.kind = 'secret'
			  AND auth.is_agent_of_user(k.agent_subject_id, $3::uuid, $4::uuid)
		)`,
		project, resource, actor, user,
	).Scan(&allowed)
	return allowed, err
}

// ListUserAgentSecretIDs returns secrets bound to agents owned by this user and attested by this actor.
func (p *PsqlDB) ListUserAgentSecretIDs(ctx context.Context, project, actor, user string) ([]string, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT r.public_id
		FROM secret_agent_keys k
		JOIN resources r ON r.id = k.secret_id AND r.project_id = k.project_id
		JOIN projects p ON p.id = r.project_id
		WHERE p.public_id = $1
		  AND r.kind = 'secret'
		  AND auth.is_agent_of_user(k.agent_subject_id, $2::uuid, $3::uuid)`,
		project, actor, user,
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

// RegisteredAccessClient accepts direct access only for an active client whose
// registered login profile addresses this resource server.
func (p *PsqlDB) RegisteredAccessClient(ctx context.Context, client, audience string) (bool, error) {
	var registered bool
	err := p.pool.QueryRow(ctx, `SELECT auth.is_registered_access_client($1, $2)`, client, audience).Scan(&registered)
	return registered, err
}
