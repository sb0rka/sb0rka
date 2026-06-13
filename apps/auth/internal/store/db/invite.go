package db

import (
	"context"

	"github.com/google/uuid"
)

func (p *PsqlDB) CheckUserInvite(ctx context.Context, inviteCode string) (bool, error) {
	const query = `
		SELECT EXISTS (SELECT 1 FROM user_invites WHERE id = $1 AND user_id IS NULL)
	`
	var exists bool
	err := p.pool.QueryRow(ctx, query, inviteCode).Scan(&exists)
	return exists, err
}

func (p *PsqlDB) ClaimUserInvite(ctx context.Context, inviteCode string, userID uuid.UUID) error {
	const query = `
		UPDATE user_invites
		SET user_id = $2
		WHERE id = $1
	`
	_, err := p.pool.Exec(ctx, query, inviteCode, userID)
	return err
}
