package authapp

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/invite"
)

type Options struct {
	RequireInvite bool
	InviteProvider invite.Provider
	// NewInviteProvider builds invite provider from the auth DB pool after connect.
	NewInviteProvider func(pool *pgxpool.Pool) invite.Provider
}
