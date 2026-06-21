package registration

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type Request struct {
	Username string
	Email    string
	Extras   map[string]json.RawMessage
	Header   http.Header
}

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

func Noop() Hook { return noop{} }

type noop struct{}

func (noop) BeforeCreate(context.Context, Request) error { return nil }

func (noop) Provision(context.Context, pgx.Tx, Request, uuid.UUID) error { return nil }
