package route

import (
	"context"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Access int

const (
	Authenticated Access = iota
	LiveSession
	Public
)

type Route struct {
	Pattern string
	Handler http.HandlerFunc
	Access  Access
}

type Dependencies struct {
	Pool *pgxpool.Pool
	// AuthorizeProjectRead allows every project role, including viewer.
	AuthorizeProjectRead      func(ctx context.Context, projectPublicID string) (uuid.UUID, error)
	AuthorizeSecretReadMeta   func(ctx context.Context, projectPublicID string) (uuid.UUID, error)
	AuthorizeSecretUpdateMeta func(ctx context.Context, projectPublicID string) (uuid.UUID, error)
}

// StatusError exposes controlled access errors through coretransport.WriteHookError.
type StatusError struct {
	Status  int
	Message string
}

func (e *StatusError) Error() string         { return e.Message }
func (e *StatusError) StatusCode() int       { return e.Status }
func (e *StatusError) ClientMessage() string { return e.Message }

// RoutesFactory builds extension routes. Public routes skip authentication;
// other routes require JWT or a live session. All routes receive logging,
// CORS, and panic recovery.
// Extension handlers must explicitly authorize resource access;
// the router does not infer or enforce RBAC actions for them.
type RoutesFactory func(deps Dependencies) []Route
