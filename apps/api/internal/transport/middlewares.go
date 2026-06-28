package transport

import (
	"net/http"
	"time"

	"github.com/sb0rka/sb0rka/apps/api/internal/service"
	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"

	"github.com/google/uuid"
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
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorization := r.Header.Get("Authorization")
		identity, err := service.ParseAndVerifyAccessTokenFromAuthHeader(authorization, s.deps.Cfg.AuthConfig)
		if err != nil {
			s.deps.Log.Info("auth_unauthorized", "path", r.URL.Path, "error", err)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		ctx := authctx.WithIdentity(r.Context(), authctx.Identity{
			SubjectID:   identity.SubjectID,
			SubjectKind: identity.SubjectKind,
			SessionID:   identity.SessionID,
			JTI:         identity.JTI,
		})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// requireLiveSessionMiddleware is chained after authMiddleware on security-sensitive endpoints.
// It verifies the current token's session with a minimal live-session check:
//   - authMiddleware has already verified the JWT and stored sub/sid in context.
//   - sid and sub are parsed as UUIDs.
//   - Platform calls the auth-owned live-session function through the store, which
//     returns only a boolean: session exists, is not revoked/expired, and belongs
//     to the token subject. Platform never reads refresh token/session internals.
func (s *Server) requireLiveSessionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
