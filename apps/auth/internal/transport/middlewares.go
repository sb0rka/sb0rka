package transport

import (
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"
	"github.com/sb0rka/sb0rka/apps/auth/internal/service"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
	coretransport "github.com/sb0rka/sb0rka/packages/core/transport"
	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"
)

// responseWriter wraps http.ResponseWriter to capture status code and bytes written
type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}

// loggerMiddleware logs every request: method, path, status, duration
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

// Handle panic errors to prevent server shutdown
func (s *Server) panicMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				s.deps.Log.Info("http_panic", "error", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
		}()
		// There will be a defer with panic handler in each next function
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
				allowHeaders += ", Authorization, Idempotency-Key"
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				// Don't allow credentials for wildcard
			}
			w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			w.Header().Set("Access-Control-Allow-Methods", s.deps.Cfg.CORSAllowedDefaultMethods)
			// Credentials are cookies, authorization headers, or TLS client certificates
			w.Header().Set("Access-Control-Allow-Headers", allowHeaders)
		}
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// authMiddleware validates the access token JWT (stateless: signature, alg, typ, iss, aud, exp, claims)
// and stores the extracted identity in the request context. No DB call is made here.
//
// Auth's own routes accept only a direct user login from an internal client
// (console or consent). A delegated token shares aud=sb0rka-api, so actor and
// scope are rejected here before the session check.
func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if len(r.Header.Values("Authorization")) != 1 {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		authorization := r.Header.Get("Authorization")
		identity, err := service.ParseAndVerifyAccessTokenFromAuthHeader(r.Context(), authorization, s.deps.Cfg.AuthConfig)
		if err != nil {
			s.deps.Log.Info("auth_unauthorized", "path", r.URL.Path, "error", err)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if !s.directAPIClient(identity) {
			s.deps.Log.Info("auth_forbidden", "path", r.URL.Path, "client_id", identity.ClientID)
			http.Error(w, "Forbidden", http.StatusForbidden)
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

// directAPIClient is a non-delegated user token issued to an internal client
// whose only audience is the platform API.
func (s *Server) directAPIClient(identity service.AccessTokenIdentity) bool {
	if identity.SubjectKind != coreauth.SubjectUser || identity.ActorSubjectID != "" || identity.Scope != "" {
		return false
	}
	if s.deps.Cfg.OIDC == nil {
		return false
	}
	client, ok := s.deps.Cfg.OIDC.Registry.Client(identity.ClientID)
	return ok && client.Type == "internal" && client.AccessAudience == coreauth.AudienceAPI
}

// optionalBrowserSessionMiddleware resolves a browser cookie without rotating
// it. Missing, malformed, revoked, and expired cookies deliberately continue as
// anonymous requests so protocol handlers can choose their own fallback.
func (s *Server) optionalBrowserSessionMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Pragma", "no-cache")

		cookie, err := r.Cookie(s.deps.Cfg.AuthConfig.RefreshTokenCookieName)
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}

		refreshToken, err := service.ValidateLengthOfRefreshToken(cookie.Value, s.deps.Cfg.AuthConfig)
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}

		session, err := s.deps.Database.ResolveBrowserSession(
			r.Context(),
			service.HashRefreshToken(refreshToken),
		)
		if err != nil {
			if errors.Is(err, db.ErrTokenNotFound) {
				next.ServeHTTP(w, r)
				return
			}
			s.deps.Log.Error("browser_session_resolution_failed", "path", r.URL.Path, "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		ctx := authctx.WithIdentity(r.Context(), authctx.Identity{
			SubjectID:   session.SubjectID.String(),
			SubjectKind: model.SubjectKindUser,
			SessionID:   session.SessionID.String(),
		})
		ctx = authctx.WithAuthenticationTime(ctx, session.AuthenticationTime.UTC())
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// requireEmailVerificationMiddleware is chained after authMiddleware and,
// when needed, requireLiveSessionMiddleware. Route registration remains
// responsible for opting into this policy.
func (s *Server) requireEmailVerificationMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		subjectIDRaw, ok := authctx.SubjectIDFromContext(r.Context())
		if !ok {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		subjectKind, ok := authctx.SubjectKindFromContext(r.Context())
		if !ok {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if subjectKind != model.SubjectKindUser {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		userID, err := uuid.Parse(subjectIDRaw)
		if err != nil {
			s.deps.Log.Error(
				"email_verification_invalid_subject_id",
				"path", r.URL.Path,
				"subject_id", subjectIDRaw,
				"error", err,
			)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		if err := s.deps.VerificationHook.BeforeAccess(r.Context(), userID); err != nil {
			coretransport.WriteHookError(
				w,
				err,
				s.deps.Log,
				"verification_hook_failed",
				"path", r.URL.Path,
			)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// requireLiveSessionMiddleware is chained after authMiddleware on security-sensitive endpoints.
// It verifies three things:
//   - The session exists in the DB and is not revoked or expired.
//   - The session's SubjectID matches the token's sub claim — guards against any
//     inconsistency between JWT claims and session ownership.
//   - (Implicit) authMiddleware has already run and populated identity in context.
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

		session, err := s.deps.Database.GetAuthSession(r.Context(), sessionID)
		if err != nil {
			if errors.Is(err, db.ErrTokenNotFound) {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}
			s.deps.Log.Error("live_session_check_failed", "path", r.URL.Path, "session_id", sessionIDRaw, "error", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		if session.RevokedAt != nil || !session.ExpiresAt.After(time.Now().UTC()) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if session.SubjectID != subjectID {
			s.deps.Log.Error("live_session_subject_mismatch",
				"path", r.URL.Path,
				"token_subject", subjectIDRaw,
				"session_subject", session.SubjectID.String(),
			)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}
