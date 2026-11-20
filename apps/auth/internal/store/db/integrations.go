package db

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/oidcaccess"
)

// An entry with zero sessions is accessible. Denied clients are omitted.
func (p *PsqlDB) AccessibleOIDCSessionCounts(ctx context.Context, subjectID uuid.UUID, clientIDs []string, check oidcaccess.Check) (map[string]int64, error) {
	if len(clientIDs) == 0 {
		return nil, nil
	}
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	counts := make(map[string]int64, len(clientIDs))
	for _, clientID := range clientIDs {
		err := requireOIDCAccess(ctx, tx, subjectID, clientID, check)
		if errors.Is(err, ErrOIDCAccessDenied) {
			continue
		}
		if err != nil {
			return nil, err
		}
		var count int64
		err = tx.QueryRow(ctx, `
			SELECT count(*) FROM auth_sessions
			WHERE subject_id = $1 AND oauth_client_id = $2
				AND revoked_at IS NULL AND expires_at > now()
		`, subjectID, clientID).Scan(&count)
		if err != nil {
			return nil, err
		}
		counts[clientID] = count
	}
	return counts, tx.Commit(ctx)
}
