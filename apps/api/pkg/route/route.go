package route

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Access int

const (
	Authenticated Access = iota
	LiveSession
)

type Route struct {
	Pattern string
	Handler http.HandlerFunc
	Access  Access
}

// RoutesFactory builds extension routes using the shared platform pool.
// The server applies authentication, logging, CORS and panic recovery.
type RoutesFactory func(pool *pgxpool.Pool) []Route
