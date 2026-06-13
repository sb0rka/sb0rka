package runtime

import (
	"context"

	"github.com/sb0rka/sb0rka/apps/auth/internal/service"
)

type authContextKey string

const (
	AuthUserIDKey      authContextKey = "auth_user_id"
	AuthSubjectIDKey   authContextKey = "auth_subject_id"
	AuthSubjectKindKey authContextKey = "auth_subject_kind"
	AuthSessionIDKey   authContextKey = "auth_session_id"
	AuthJTIKey         authContextKey = "auth_jti"
)

func WithAuthIdentity(ctx context.Context, identity service.AccessTokenIdentity) context.Context {
	ctx = context.WithValue(ctx, AuthSubjectIDKey, identity.SubjectID)
	ctx = context.WithValue(ctx, AuthSubjectKindKey, identity.SubjectKind)
	ctx = context.WithValue(ctx, AuthSessionIDKey, identity.SessionID)
	ctx = context.WithValue(ctx, AuthJTIKey, identity.JTI)
	if identity.SubjectKind == "user" {
		ctx = context.WithValue(ctx, AuthUserIDKey, identity.SubjectID)
	}
	return ctx
}

func AuthUserIDFromContext(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(AuthUserIDKey).(string)
	if !ok || userID == "" {
		return "", false
	}
	return userID, true
}

func AuthSubjectIDFromContext(ctx context.Context) (string, bool) {
	subjectID, ok := ctx.Value(AuthSubjectIDKey).(string)
	if !ok || subjectID == "" {
		return "", false
	}
	return subjectID, true
}

func AuthSubjectKindFromContext(ctx context.Context) (string, bool) {
	subjectKind, ok := ctx.Value(AuthSubjectKindKey).(string)
	if !ok || subjectKind == "" {
		return "", false
	}
	return subjectKind, true
}

func AuthenticatedUserSubjectIDFromContext(ctx context.Context) (string, bool) {
	subjectID, ok := AuthSubjectIDFromContext(ctx)
	if !ok {
		return "", false
	}
	subjectKind, ok := AuthSubjectKindFromContext(ctx)
	if !ok || subjectKind != "user" {
		return "", false
	}
	return subjectID, true
}

func AuthSessionIDFromContext(ctx context.Context) (string, bool) {
	sessionID, ok := ctx.Value(AuthSessionIDKey).(string)
	if !ok || sessionID == "" {
		return "", false
	}
	return sessionID, true
}
