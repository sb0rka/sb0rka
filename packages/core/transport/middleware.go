package transport

import (
	"log/slog"
	"net/http"
	"strconv"
	"time"
)

// Middleware wraps an HTTP handler.
type Middleware func(http.Handler) http.Handler

// Chain навешивает обёртки в порядке перечисления: первая оказывается внешней.
func Chain(h http.Handler, middlewares ...Middleware) http.Handler {
	for i := len(middlewares) - 1; i >= 0; i-- {
		h = middlewares[i](h)
	}
	return h
}

// Recorder tracks the response status and whether writing has started.
type Recorder struct {
	http.ResponseWriter
	status  int
	written bool
}

func (rec *Recorder) Status() int   { return rec.status }
func (rec *Recorder) Written() bool { return rec.written }

func (rec *Recorder) WriteHeader(status int) {
	if rec.written {
		return
	}
	rec.status = status
	rec.written = true
	rec.ResponseWriter.WriteHeader(status)
}

func (rec *Recorder) Write(b []byte) (int, error) {
	if !rec.written {
		rec.WriteHeader(http.StatusOK)
	}
	return rec.ResponseWriter.Write(b)
}

// Logger records method, path, status and duration.
func Logger(log *slog.Logger) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			started := time.Now()
			rec := &Recorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rec, r)
			log.Info("request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", rec.status,
				"duration_ms", time.Since(started).Milliseconds())
		})
	}
}

// Recover delegates a panic response to onPanic. After writing starts, it
// aborts the connection because a valid error response can no longer be sent.
func Recover(log *slog.Logger, onPanic func(http.ResponseWriter, *http.Request)) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rec, _ := w.(*Recorder)
			defer func() {
				if p := recover(); p != nil {
					log.Error("panic", "recover", p, "path", r.URL.Path)
					if rec != nil && rec.Written() {
						panic(http.ErrAbortHandler)
					}
					if onPanic != nil {
						onPanic(w, r)
						return
					}
					http.Error(w, "internal server error", http.StatusInternalServerError)
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// CORSConfig configures CORS response headers.
type CORSConfig struct {
	Whitelist      map[string]bool
	AllowedMethods string
	MaxAge         int
}

const defaultAllowedMethods = "GET, POST, PUT, PATCH, DELETE, OPTIONS"

// CORS allows credentials only for explicit origins and varies cached responses
// by Origin when a whitelist is used.
func CORS(cfg CORSConfig) Middleware {
	methods := cfg.AllowedMethods
	if methods == "" {
		methods = defaultAllowedMethods
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			wildcard := cfg.Whitelist["*"]

			var allowedOrigin string
			if wildcard {
				allowedOrigin = "*"
			} else if origin := r.Header.Get("Origin"); cfg.Whitelist[origin] {
				allowedOrigin = origin
			}

			if !wildcard {
				w.Header().Add("Vary", "Origin")
			}

			if allowedOrigin != "" {
				allowHeaders := "Content-Type"
				if allowedOrigin != "*" {
					allowHeaders += ", Authorization"
					w.Header().Set("Access-Control-Allow-Credentials", "true")
				}
				w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
				w.Header().Set("Access-Control-Allow-Methods", methods)
				w.Header().Set("Access-Control-Allow-Headers", allowHeaders)
				if cfg.MaxAge > 0 {
					w.Header().Set("Access-Control-Max-Age", strconv.Itoa(cfg.MaxAge))
				}
			}

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
