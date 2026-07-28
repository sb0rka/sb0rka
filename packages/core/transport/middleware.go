package transport

import (
	"log/slog"
	"net/http"
	"time"
)

// Middleware — обёртка обработчика. Отдельный тип, чтобы Chain читался.
type Middleware func(http.Handler) http.Handler

// Chain навешивает обёртки в порядке перечисления: первая оказывается внешней.
func Chain(h http.Handler, middlewares ...Middleware) http.Handler {
	for i := len(middlewares) - 1; i >= 0; i-- {
		h = middlewares[i](h)
	}
	return h
}

// Recorder запоминает статус ответа и факт первой записи.
//
// Нужен двоим: логу — чтобы писать статус, а Recover — чтобы понимать, можно
// ли ещё отдать тело ошибки. Поэтому Logger должен стоять снаружи Recover:
// обёртку создаёт он.
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

// Logger пишет метод, путь, статус и длительность.
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

// Recover ловит панику и отдаёт ответ через onPanic — формат ошибки у каждого
// сервиса свой, и навязывать его отсюда нечем.
//
// Если тело уже отправлено, корректный ответ дописать нельзя: второй
// WriteHeader даёт «superfluous WriteHeader» в логе вместо самой паники.
// В этом случае соединение рвётся — клиент увидит обрыв, а не притворно
// успешный ответ.
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

// CORSConfig — то, что различается между сервисами. Пустой AllowedMethods
// означает набор по умолчанию.
type CORSConfig struct {
	// Whitelist в формате config.ParseCORSWhitelist: "*" — обычный ключ.
	Whitelist      map[string]bool
	AllowedMethods string
	// MaxAge в секундах. Ноль — заголовок не ставится, и префлайт полетит
	// перед каждым запросом.
	MaxAge int
}

const defaultAllowedMethods = "GET, POST, PUT, PATCH, DELETE, OPTIONS"

// CORS выставляет заголовки одинаково во всех сервисах платформы.
//
// Authorization и credentials идут только явно разрешённому источнику: вместе
// с «*» браузер их всё равно отвергнет. Vary: Origin ставится и в отказе —
// ответ зависит от Origin в обоих случаях, и без него кэш отдал бы чужому
// источнику ответ, собранный для разрешённого.
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
					w.Header().Set("Access-Control-Max-Age", itoa(cfg.MaxAge))
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

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
