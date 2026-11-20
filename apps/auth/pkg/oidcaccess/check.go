// Package oidcaccess provides the policy hook for user and agent credentials.
package oidcaccess

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Check evaluates a user or an agent's registered owner for the given client.
// An agent without an owner supplies uuid.Nil. A false result denies access.
type Check func(ctx context.Context, tx pgx.Tx, subjectID uuid.UUID, clientID string) (bool, error)

type Hook interface {
	// Allowed runs inside the transaction issuing or replaying credentials.
	Allowed(ctx context.Context, tx pgx.Tx, subjectID uuid.UUID, clientID string) (bool, error)
}

// Repository is the feature's opaque persistence handle.
type Repository any
type RepositoryFactory func(pool *pgxpool.Pool) Repository
type HookFactory func(repo Repository) Hook

func Noop() Hook { return noop{} }

type noop struct{}

func (noop) Allowed(context.Context, pgx.Tx, uuid.UUID, string) (bool, error) {
	return true, nil
}
