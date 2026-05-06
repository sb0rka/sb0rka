package runtime

import (
	"context"

	"github.com/sb0rka/sb0rka/apps/api/internal/service"
)

type authContextKey string

const (
	authSubjectIDKey   authContextKey = "auth_subject_id"
	authSubjectKindKey authContextKey = "auth_subject_kind"
	authSessionIDKey   authContextKey = "auth_session_id"
	authJTIKey         authContextKey = "auth_jti"
)

func WithAuthIdentity(ctx context.Context, identity service.AccessTokenIdentity) context.Context {
	ctx = context.WithValue(ctx, authSubjectIDKey, identity.SubjectID)
	ctx = context.WithValue(ctx, authSubjectKindKey, identity.SubjectKind)
	ctx = context.WithValue(ctx, authSessionIDKey, identity.SessionID)
	ctx = context.WithValue(ctx, authJTIKey, identity.JTI)
	return ctx
}

func AuthSubjectIDFromContext(ctx context.Context) (string, bool) {
	subjectID, ok := ctx.Value(authSubjectIDKey).(string)
	if !ok || subjectID == "" {
		return "", false
	}
	return subjectID, true
}

func AuthSubjectKindFromContext(ctx context.Context) (string, bool) {
	subjectKind, ok := ctx.Value(authSubjectKindKey).(string)
	if !ok || subjectKind == "" {
		return "", false
	}
	return subjectKind, true
}

func AuthSessionIDFromContext(ctx context.Context) (string, bool) {
	sessionID, ok := ctx.Value(authSessionIDKey).(string)
	if !ok || sessionID == "" {
		return "", false
	}
	return sessionID, true
}

func AuthJTIFromContext(ctx context.Context) (string, bool) {
	jti, ok := ctx.Value(authJTIKey).(string)
	if !ok || jti == "" {
		return "", false
	}
	return jti, true
}
