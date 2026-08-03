package transport

import (
	"crypto/ed25519"
	"net/http"

	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
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

// ParseAndVerifyAccessToken разбирает токен и возвращает личность.
// Причина отказа наружу не уходит — она одинаковая для клиента и разная
// только в логе.
func ParseAndVerifyAccessToken(raw string, cfg AuthConfig) (authctx.Identity, bool) {
	identity, err := coreauth.VerifyAccessToken(raw, coreauth.VerificationConfig{
		PublicKey: cfg.PublicKey,
		KeyID:     cfg.Kid,
		TokenType: cfg.Typ,
		Issuer:    cfg.Issuer,
		Audience:  cfg.Audience,
	})
	if err != nil {
		return authctx.Identity{}, false
	}

	return authctx.Identity{
		SubjectID:   identity.SubjectID,
		SubjectKind: identity.SubjectKind,
		SessionID:   identity.SessionID,
		JTI:         identity.JTI,
		ClientID:    identity.ClientID,
	}, true
}

// BearerToken достаёт токен из заголовка Authorization.
func BearerToken(header string) (string, bool) {
	token, err := coreauth.ParseBearerToken(header)
	return token, err == nil
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
