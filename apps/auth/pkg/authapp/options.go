package authapp

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/registration"
)

type Options struct {
	// NewRegistrationHook builds the registration hook from the auth DB pool
	// (available only after connect). Nil → registration.Noop().
	NewRegistrationHook func(pool *pgxpool.Pool) registration.Hook
}
