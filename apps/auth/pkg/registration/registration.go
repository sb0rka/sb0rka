package registration

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Request struct {
	Username string
	Email    string
	Extras   map[string]json.RawMessage
}

// StatusError is the only error a Hook may surface to the client. Status must be
// a client error (4xx); 5xx is logged and returned to the client as a generic
// message so hook internals never leak.
type StatusError struct {
	Status  int
	Message string
}

func (e *StatusError) Error() string { return e.Message }

type Hook interface {
	BeforeCreate(ctx context.Context, req Request) error
	// Provision runs inside the user-creation transaction; an error rolls the
	// whole registration back (no user is created).
	Provision(ctx context.Context, tx pgx.Tx, req Request, userID uuid.UUID) error
}

// HookFactory builds a Hook from the auth DB pool (available only after connect).
type HookFactory func(pool *pgxpool.Pool) Hook

func Noop() Hook { return noop{} }

type noop struct{}

func (noop) BeforeCreate(context.Context, Request) error { return nil }

func (noop) Provision(context.Context, pgx.Tx, Request, uuid.UUID) error { return nil }
