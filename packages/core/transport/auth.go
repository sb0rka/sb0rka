package transport

import (
	"crypto/ed25519"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"

	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"
)

// AuthConfig — то, чем проверяется access-токен платформы. Сервисы токены
// только проверяют, поэтому здесь публичный ключ: приватный верификатору
// не нужен.
//
// Issuer, Audience, Kid и Typ проверяются только если заданы: пустое значение
// в jwt.WithIssuer требует пустого поля в токене, то есть отклоняет всё.
type AuthConfig struct {
	PublicKey ed25519.PublicKey
	Issuer    string
	Audience  string
	Kid       string
	Typ       string
}

// accessTokenClaims — формат токена платформы.
type accessTokenClaims struct {
	SessionID   string `json:"sid"`
	SubjectKind string `json:"sk"`
	jwt.RegisteredClaims
}

// ParseAndVerifyAccessToken разбирает токен и возвращает личность.
// Причина отказа наружу не уходит — она одинаковая для клиента и разная
// только в логе.
func ParseAndVerifyAccessToken(raw string, cfg AuthConfig) (authctx.Identity, bool) {
	if len(cfg.PublicKey) == 0 {
		return authctx.Identity{}, false
	}

	opts := []jwt.ParserOption{
		jwt.WithValidMethods([]string{jwt.SigningMethodEdDSA.Alg()}),
		jwt.WithExpirationRequired(),
	}
	if cfg.Issuer != "" {
		opts = append(opts, jwt.WithIssuer(cfg.Issuer))
	}
	if cfg.Audience != "" {
		opts = append(opts, jwt.WithAudience(cfg.Audience))
	}

	claims := &accessTokenClaims{}
	_, err := jwt.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		if cfg.Kid != "" {
			kid, _ := token.Header["kid"].(string)
			if kid != cfg.Kid {
				return nil, jwt.ErrTokenUnverifiable
			}
		}
		if cfg.Typ != "" {
			typ, _ := token.Header["typ"].(string)
			if typ != cfg.Typ {
				return nil, jwt.ErrTokenUnverifiable
			}
		}
		return ed25519.PublicKey(cfg.PublicKey), nil
	}, opts...)
	if err != nil {
		return authctx.Identity{}, false
	}
	if claims.Subject == "" || claims.SessionID == "" {
		return authctx.Identity{}, false
	}

	return authctx.Identity{
		SubjectID:   claims.Subject,
		SubjectKind: claims.SubjectKind,
		SessionID:   claims.SessionID,
		JTI:         claims.ID,
	}, true
}

// BearerToken достаёт токен из заголовка Authorization.
func BearerToken(header string) (string, bool) {
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return "", false
	}
	token := strings.TrimSpace(strings.TrimPrefix(header, prefix))
	return token, token != ""
}

// Auth проверяет токен и кладёт личность в контекст.
//
// Отказ отдаётся через onUnauthorized: формат ошибки у сервисов разный —
// у api это http.Error, у ir конверт {"error":{"code","message"}}, — и
// навязывать его отсюда нечем.
//
// Дополнительные проверки поверх личности (живая сессия, роли, тенант)
// навешиваются своим middleware следом: они ходят в базу, а этот пакет
// про базу не знает.
func Auth(cfg AuthConfig, onUnauthorized func(http.ResponseWriter, *http.Request)) Middleware {
	deny := onUnauthorized
	if deny == nil {
		deny = func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw, ok := BearerToken(r.Header.Get("Authorization"))
			if !ok {
				deny(w, r)
				return
			}

			identity, ok := ParseAndVerifyAccessToken(raw, cfg)
			if !ok {
				deny(w, r)
				return
			}

			next.ServeHTTP(w, r.WithContext(authctx.WithIdentity(r.Context(), identity)))
		})
	}
}
