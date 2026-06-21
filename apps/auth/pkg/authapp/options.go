package authapp

import (
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/registration"
)

type Options struct {
	RegistrationHook    registration.Hook
	NewRegistrationHook func(pool *pgxpool.Pool) registration.Hook
}
