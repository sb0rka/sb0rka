package authctx

import (
	"context"
	"time"
)

// Identity holds verified JWT identity claims propagated from auth middleware to handlers.
type Identity struct {
	SubjectID   string
	SubjectKind string
	SessionID   string
	JTI         string
	ClientID    string

	ActorSubjectID   string
	ActorSubjectKind string
}

type identityKey struct{}

type authenticationTimeKey struct{}

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

// WithAuthenticationTime adds the time of the original authentication event
// without changing the shared identity shape.
func WithAuthenticationTime(ctx context.Context, authenticationTime time.Time) context.Context {
	return context.WithValue(ctx, authenticationTimeKey{}, authenticationTime)
}

// AuthenticationTimeFromContext returns the original authentication time
// previously attached by an authentication middleware.
func AuthenticationTimeFromContext(ctx context.Context) (time.Time, bool) {
	authenticationTime, ok := ctx.Value(authenticationTimeKey{}).(time.Time)
	if !ok || authenticationTime.IsZero() {
		return time.Time{}, false
	}
	return authenticationTime, true
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

func ClientIDFromContext(ctx context.Context) (string, bool) {
	identity, ok := IdentityFromContext(ctx)
	if !ok || identity.ClientID == "" {
		return "", false
	}
	return identity.ClientID, true
}

// RequireUserSubject returns the subject ID when the authenticated subject is a user.
func RequireUserSubject(ctx context.Context) (string, bool) {
	identity, ok := IdentityFromContext(ctx)
	if !ok || identity.SubjectKind != "user" {
		return "", false
	}
	return identity.SubjectID, true
}
