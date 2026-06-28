package authctx

import "context"

// Identity holds verified JWT identity claims propagated from auth middleware to handlers.
type Identity struct {
	SubjectID   string
	SubjectKind string
	SessionID   string
	JTI         string

	ActorSubjectID   string
	ActorSubjectKind string
}

type identityKey struct{}

func WithIdentity(ctx context.Context, identity Identity) context.Context {
	return context.WithValue(ctx, identityKey{}, identity)
}

func IdentityFromContext(ctx context.Context) (Identity, bool) {
	identity, ok := ctx.Value(identityKey{}).(Identity)
	if !ok {
		return Identity{}, false
	}
	if identity.SubjectID == "" {
		return Identity{}, false
	}
	return identity, true
}

func SubjectIDFromContext(ctx context.Context) (string, bool) {
	identity, ok := IdentityFromContext(ctx)
	if !ok {
		return "", false
	}
	return identity.SubjectID, true
}

func SubjectKindFromContext(ctx context.Context) (string, bool) {
	identity, ok := IdentityFromContext(ctx)
	if !ok {
		return "", false
	}
	if identity.SubjectKind == "" {
		return "", false
	}
	return identity.SubjectKind, true
}

func SessionIDFromContext(ctx context.Context) (string, bool) {
	identity, ok := IdentityFromContext(ctx)
	if !ok {
		return "", false
	}
	if identity.SessionID == "" {
		return "", false
	}
	return identity.SessionID, true
}

func JTIFromContext(ctx context.Context) (string, bool) {
	identity, ok := IdentityFromContext(ctx)
	if !ok {
		return "", false
	}
	if identity.JTI == "" {
		return "", false
	}
	return identity.JTI, true
}

// RequireUserSubject returns the subject ID when the authenticated subject is a user.
func RequireUserSubject(ctx context.Context) (string, bool) {
	identity, ok := IdentityFromContext(ctx)
	if !ok || identity.SubjectKind != "user" {
		return "", false
	}
	return identity.SubjectID, true
}
