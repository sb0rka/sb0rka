package authhttp

import "net/http"

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
}

type RoutesFactory func(database any) []Route
