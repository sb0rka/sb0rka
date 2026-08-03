package route

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Access int

const (
	Public Access = iota
	Authenticated
	LiveSession
)

type Route struct {
	Pattern string // ServeMux pattern, e.g. "GET /identity/organizations"
	Handler http.HandlerFunc
	Access  Access

	// RequireEmailVerification opts this route into the verification policy.
	// Authentication and live-session checks still come first.
	RequireEmailVerification bool
}

// RoutesFactory builds feature routes on top of the auth database pool.
type RoutesFactory func(pool *pgxpool.Pool) []Route
