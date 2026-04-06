package transport

import (
	"net/http"
	"time"

	"github.com/sb0rka/sb0rka/apps/api/internal/service"
	"github.com/sb0rka/sb0rka/apps/api/internal/transport/runtime"
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
		s.deps.Log.Info(
			"http_request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", wrapped.status,
			"duration_ms", duration.Milliseconds(),
			"remote_addr", r.RemoteAddr,
		)
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
		ctx := runtime.WithAuthIdentity(r.Context(), identity)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
