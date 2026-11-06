package transport

import (
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/sb0rka/sb0rka/apps/api/internal/service"
	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"
)

type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}

func (s *Server) loggerMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		wrapped := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(wrapped, r)
		duration := time.Since(start)
		args := []any{
			"method", r.Method,
			"path", r.URL.Path,
			"status", wrapped.status,
			"duration_ms", duration.Milliseconds(),
			"remote_addr", r.RemoteAddr,
		}
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			args = append(args, "x_forwarded_for", xff)
		}
		if xrip := r.Header.Get("X-Real-IP"); xrip != "" {
			args = append(args, "x_real_ip", xrip)
		}
		s.deps.Log.Info("http_request", args...)
	})
}

func (s *Server) panicMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				s.deps.Log.Info("http_panic", "error", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var allowedOrigin string
		if s.deps.Cfg.CORSWhitelist["*"] {
			allowedOrigin = "*"
		} else {
			origin := r.Header.Get("Origin")
			if _, ok := s.deps.Cfg.CORSWhitelist[origin]; ok {
				allowedOrigin = origin
			}
		}

		if allowedOrigin != "" {
			allowHeaders := "Content-Type"
			if allowedOrigin != "*" {
				allowHeaders += ", Authorization"
				w.Header().Set("Access-Control-Allow-Credentials", "true")
			}
			w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			w.Header().Set("Access-Control-Allow-Methods", s.deps.Cfg.CORSAllowedDefaultMethods)
			w.Header().Set("Access-Control-Allow-Headers", allowHeaders)
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// authMiddleware verifies the access token and the delegation rules of the matched route.
// delegatedScope is the scope delegated tokens need on this route; "" rejects delegation.
func (s *Server) authMiddleware(next http.Handler, delegatedScope string, allowAgent bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if len(r.Header.Values("Authorization")) != 1 {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		authorization := r.Header.Get("Authorization")
		identity, err := service.ParseAndVerifyAccessTokenFromAuthHeader(r.Context(), authorization, s.deps.Cfg.AuthConfig)
		if err != nil {
			s.deps.Log.Info("auth_unauthorized", "path", r.URL.Path, "error", err)
			if errors.Is(err, coreauth.ErrKeysUnavailable) {
				http.Error(w, "Authentication unavailable", http.StatusServiceUnavailable)
			} else {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
			}
			return
		}
		if identity.SubjectKind == coreauth.SubjectAgent {
			if !allowAgent || !s.authorizeAgent(w, r, identity) {
				if !allowAgent {
					http.Error(w, "Unauthorized", http.StatusUnauthorized)
				}
				return
			}
			ctx := authctx.WithIdentity(r.Context(), authctx.Identity{
				SubjectID:   identity.SubjectID,
				SubjectKind: identity.SubjectKind,
				JTI:         identity.JTI,
				ClientID:    identity.ClientID,
				Scope:       identity.Scope,
			})
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}
		if identity.SubjectKind != coreauth.SubjectUser {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if !s.authorizeDelegation(w, r, identity, delegatedScope) {
			return
		}
		ctx := authctx.WithIdentity(r.Context(), authctx.Identity{
			SubjectID:         identity.SubjectID,
			SubjectKind:       identity.SubjectKind,
			SessionID:         identity.SessionID,
			JTI:               identity.JTI,
			ClientID:          identity.ClientID,
			Scope:             identity.Scope,
			DelegationID:      identity.DelegationID,
			DelegationVersion: identity.DelegationVersion,
			ProjectIDs:        identity.ProjectIDs,
			ActorSubjectID:    identity.ActorSubjectID,
		})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// requireLiveMiddleware is chained after authMiddleware on security-sensitive endpoints.
// Liveness depends on the subject kind:
//   - An agent has no session. authMiddleware already proved it live through the
//     auth-owned is_live_agent check (key enrolled, not revoked, host matches), so
//     nothing more is required here.
//   - A user token is checked with a minimal live-session lookup: sid and sub are
//     parsed as UUIDs and the auth-owned live-session function returns only a boolean
//     (session exists, is not revoked/expired, and belongs to the token subject).
//     Platform never reads refresh token/session internals.
func (s *Server) requireLiveMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if kind, _ := authctx.SubjectKindFromContext(r.Context()); kind == coreauth.SubjectAgent {
			next.ServeHTTP(w, r)
			return
		}
		sessionIDRaw, ok := authctx.SessionIDFromContext(r.Context())
		if !ok {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		sessionID, err := uuid.Parse(sessionIDRaw)
		if err != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		subjectIDRaw, ok := authctx.SubjectIDFromContext(r.Context())
		if !ok {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		subjectID, err := uuid.Parse(subjectIDRaw)
		if err != nil {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		live, err := s.deps.PlatformDatabase.IsLiveSession(r.Context(), sessionID, subjectID)
		if err != nil {
			s.deps.Log.Error("live_session_check_failed", "path", r.URL.Path, "session_id", sessionIDRaw, "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		if !live {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}
