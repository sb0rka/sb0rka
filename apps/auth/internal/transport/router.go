package transport

import (
	"net/http"

	"github.com/sb0rka/sb0rka/apps/auth/internal/transport/auth"
	"github.com/sb0rka/sb0rka/apps/auth/internal/transport/runtime"
	"github.com/sb0rka/sb0rka/apps/auth/internal/transport/users"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/route"
)

type Dependencies = runtime.Dependencies

type Server struct {
	deps Dependencies

	auth  *auth.Handler
	users *users.Handler
}

func NewServer(deps Dependencies) *Server {
	return &Server{
		deps:  deps,
		auth:  auth.NewHandler(deps),
		users: users.NewHandler(deps),
	}
}

func (s *Server) BuildCommonHandler() *http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /ping", s.ping)
	mux.HandleFunc("GET /health", s.health)

	// Auth endpoints
	mux.HandleFunc("POST /auth/login", s.auth.AuthLogin)
	mux.HandleFunc("POST /auth/refresh", s.auth.AuthRefresh)
	mux.Handle("POST /auth/logout", s.authMiddleware(s.requireLiveSessionMiddleware(http.HandlerFunc(s.auth.AuthLogout))))
	mux.Handle("GET /auth/subject", s.authMiddleware(http.HandlerFunc(s.auth.AuthGetSubject)))
	mux.Handle("GET /auth/sessions", s.authMiddleware(s.requireLiveSessionMiddleware(http.HandlerFunc(s.auth.AuthSessionsList))))
	mux.Handle("DELETE /auth/sessions", s.authMiddleware(s.requireLiveSessionMiddleware(http.HandlerFunc(s.auth.AuthSessionsRevokeAll))))
	mux.Handle("DELETE /auth/sessions/{session_id}", s.authMiddleware(s.requireLiveSessionMiddleware(http.HandlerFunc(s.auth.AuthSessionRevokeOne))))

	// User identity endpoints
	mux.HandleFunc("POST /identity/users", s.users.RegisterUser)
	mux.Handle("GET /identity/users/current", s.authMiddleware(http.HandlerFunc(s.users.GetUser)))
	mux.Handle("PATCH /identity/users/current", s.authMiddleware(s.requireLiveSessionMiddleware(s.requireEmailVerificationMiddleware(http.HandlerFunc(s.users.UserPatch)))))
	mux.Handle("PUT /identity/users/current/password", s.authMiddleware(s.requireLiveSessionMiddleware(s.requireEmailVerificationMiddleware(http.HandlerFunc(s.users.UserPasswordUpdate)))))
	mux.Handle("DELETE /identity/users/current", s.authMiddleware(s.requireLiveSessionMiddleware(s.requireEmailVerificationMiddleware(http.HandlerFunc(s.users.UserDelete)))))

	// Routes provided by pluggable feature modules share the same middleware stack below.
	for _, rt := range s.deps.Routes {
		mux.Handle(rt.Pattern, s.authWrap(rt))
	}

	commonHandler := s.loggerMiddleware(mux)
	commonHandler = s.corsMiddleware(commonHandler)
	commonHandler = s.panicMiddleware(commonHandler)

	return &commonHandler
}

func (s *Server) authWrap(rt route.Route) http.Handler {
	var handler http.Handler = rt.Handler
	if rt.RequireEmailVerification {
		handler = s.requireEmailVerificationMiddleware(handler)
	}

	switch rt.Access {
	case route.LiveSession:
		return s.authMiddleware(s.requireLiveSessionMiddleware(handler))
	case route.Authenticated:
		return s.authMiddleware(handler)
	default:
		return handler
	}
}
