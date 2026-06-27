package transport

import (
	"net/http"

	"github.com/sb0rka/sb0rka/apps/auth/internal/transport/auth"
	"github.com/sb0rka/sb0rka/apps/auth/internal/transport/organizations"
	"github.com/sb0rka/sb0rka/apps/auth/internal/transport/runtime"
	"github.com/sb0rka/sb0rka/apps/auth/internal/transport/users"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/authhttp"
)

type Dependencies = runtime.Dependencies

type Server struct {
	deps Dependencies

	auth          *auth.Handler
	organizations *organizations.Handler
	users         *users.Handler
}

func NewServer(deps Dependencies) *Server {
	return &Server{
		deps:          deps,
		auth:          auth.NewHandler(deps),
		organizations: organizations.NewHandler(deps),
		users:         users.NewHandler(deps),
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
	mux.Handle("PATCH /identity/users/current", s.authMiddleware(s.requireLiveSessionMiddleware(http.HandlerFunc(s.users.UserPatch))))
	mux.Handle("PUT /identity/users/current/password", s.authMiddleware(s.requireLiveSessionMiddleware(http.HandlerFunc(s.users.UserPasswordUpdate))))
	mux.Handle("DELETE /identity/users/current", s.authMiddleware(s.requireLiveSessionMiddleware(http.HandlerFunc(s.users.UserDelete))))

	// Organization endpoints
	mux.Handle("POST /identity/organizations", s.authMiddleware(s.requireLiveSessionMiddleware(http.HandlerFunc(s.organizations.CreateOrganization))))
	mux.Handle("GET /identity/organizations/{organization_id}", s.authMiddleware(http.HandlerFunc(s.organizations.GetOrganization)))
	mux.Handle("PATCH /identity/organizations/{organization_id}", s.authMiddleware(s.requireLiveSessionMiddleware(http.HandlerFunc(s.organizations.UpdateOrganization))))
	mux.Handle("DELETE /identity/organizations/{organization_id}", s.authMiddleware(s.requireLiveSessionMiddleware(http.HandlerFunc(s.organizations.DeleteOrganization))))

	// Membership endpoints
	mux.Handle("GET /identity/organizations/{organization_id}/memberships", s.authMiddleware(http.HandlerFunc(s.organizations.ListMembers)))
	mux.Handle("POST /identity/organizations/{organization_id}/memberships", s.authMiddleware(s.requireLiveSessionMiddleware(http.HandlerFunc(s.organizations.AddMember))))
	mux.Handle("GET /identity/organizations/{organization_id}/memberships/{user_id}", s.authMiddleware(http.HandlerFunc(s.organizations.GetMember)))
	mux.Handle("PATCH /identity/organizations/{organization_id}/memberships/{user_id}", s.authMiddleware(s.requireLiveSessionMiddleware(http.HandlerFunc(s.organizations.UpdateMemberRole))))
	mux.Handle("DELETE /identity/organizations/{organization_id}/memberships/{user_id}", s.authMiddleware(s.requireLiveSessionMiddleware(http.HandlerFunc(s.organizations.RemoveMember))))

	// Routes provided by internal-only features share the same middleware stack below.
	for _, rt := range s.deps.Routes {
		mux.Handle(rt.Pattern, s.wrap(rt.Access, rt.Handler))
	}

	commonHandler := s.loggerMiddleware(mux)
	commonHandler = s.corsMiddleware(commonHandler)
	commonHandler = s.panicMiddleware(commonHandler)

	return &commonHandler
}

func (s *Server) wrap(access authhttp.Access, h http.HandlerFunc) http.Handler {
	switch access {
	case authhttp.LiveSession:
		return s.authMiddleware(s.requireLiveSessionMiddleware(h))
	case authhttp.Authenticated:
		return s.authMiddleware(h)
	default:
		return h
	}
}
