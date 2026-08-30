package transport

import (
	"fmt"
	"net/http"

	"github.com/sb0rka/sb0rka/apps/auth/internal/transport/auth"
	transportoidc "github.com/sb0rka/sb0rka/apps/auth/internal/transport/oidc"
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

func (s *Server) BuildCommonHandler() (*http.Handler, error) {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /ping", s.ping)
	mux.HandleFunc("GET /health", s.health)

	// Auth endpoints
	mux.HandleFunc("POST /auth/login", s.auth.AuthLogin)
	mux.HandleFunc("POST /auth/refresh", s.auth.AuthRefresh)
	mux.Handle("POST /auth/agent-tokens/investigation", s.authMiddleware(s.requireLiveSessionMiddleware(http.HandlerFunc(s.issueInvestigationAgentToken))))
	if s.deps.Cfg.InvestigationAgentExchange != nil {
		mux.HandleFunc("POST /auth/agent-tokens/exchange", s.exchangeInvestigationAgentToken)
	}
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

	// OIDC is a native auth transport and uses the same middleware composition
	// as optional feature routes.
	routes := make([]route.Route, 0, len(s.deps.Routes)+7)
	if s.deps.Cfg.OIDC != nil {
		oidcHandler := transportoidc.NewHandler(
			s.deps.Database,
			s.deps.Cfg.AuthConfig,
			*s.deps.Cfg.OIDC,
			s.deps.Log,
		)
		routes = append(routes,
			route.Route{Pattern: "GET /.well-known/openid-configuration", Handler: oidcHandler.Discovery, Access: route.Public},
			route.Route{Pattern: "GET /oauth2/jwks", Handler: oidcHandler.JWKS, Access: route.Public},
			route.Route{Pattern: "GET /oauth2/authorize", Handler: oidcHandler.Authorize, Access: route.OptionalBrowserSession},
			route.Route{Pattern: "POST /oauth2/token", Handler: oidcHandler.Token, Access: route.Public},
			route.Route{Pattern: "POST /oauth2/revoke", Handler: oidcHandler.Revoke, Access: route.Public},
			route.Route{Pattern: "GET /oauth2/login/continue", Handler: oidcHandler.ContinueBrowser, Access: route.OptionalBrowserSession},
			route.Route{Pattern: "POST /oauth2/login/continue", Handler: oidcHandler.ContinueConsole, Access: route.LiveSession},
		)
	}
	routes = append(routes, s.deps.Routes...)
	for _, rt := range routes {
		handler, err := s.authWrap(rt)
		if err != nil {
			return nil, fmt.Errorf("configure route %q: %w", rt.Pattern, err)
		}
		mux.Handle(rt.Pattern, handler)
	}

	commonHandler := s.loggerMiddleware(mux)
	commonHandler = s.corsMiddleware(commonHandler)
	commonHandler = s.panicMiddleware(commonHandler)

	return &commonHandler, nil
}

func (s *Server) authWrap(rt route.Route) (http.Handler, error) {
	var handler http.Handler = rt.Handler
	if rt.RequireEmailVerification {
		handler = s.requireEmailVerificationMiddleware(handler)
	}

	switch rt.Access {
	case route.Public:
		return handler, nil
	case route.Authenticated:
		return s.authMiddleware(handler), nil
	case route.LiveSession:
		return s.authMiddleware(s.requireLiveSessionMiddleware(handler)), nil
	case route.OptionalBrowserSession:
		return s.optionalBrowserSessionMiddleware(handler), nil
	default:
		return nil, fmt.Errorf("unknown access mode %d", rt.Access)
	}
}
