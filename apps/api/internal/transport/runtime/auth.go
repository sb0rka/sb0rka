package runtime

import (
	"context"

	"github.com/sb0rka/sb0rka/apps/api/internal/service"
)

type authContextKey string

const (
	authUserIDKey authContextKey = "auth_user_id"
)

func WithAuthIdentity(ctx context.Context, identity service.AccessTokenIdentity) context.Context {
	return context.WithValue(ctx, authUserIDKey, identity.UserID)
}

func AuthUserIDFromContext(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(authUserIDKey).(string)
	if !ok || userID == "" {
		return "", false
	}
	return userID, true
}
