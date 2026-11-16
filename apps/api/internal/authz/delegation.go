package authz

import (
	"context"
	"slices"
	"strings"

	coreauth "github.com/sb0rka/sb0rka/packages/core/auth"
	"github.com/sb0rka/sb0rka/packages/core/transport/authctx"
)

// DelegatedIdentity returns the request identity when it belongs to a service
// actor acting on behalf of a user. Ordinary user tokens report false.
func DelegatedIdentity(ctx context.Context) (authctx.Identity, bool) {
	identity, ok := authctx.IdentityFromContext(ctx)
	return identity, ok && identity.ActorSubjectID != ""
}

// DelegationAllows reports whether the token carries scope and, for
// project-scoped routes, the project; an empty projectPublicID skips the project check.
func DelegationAllows(identity coreauth.AccessTokenIdentity, scope, projectPublicID string) bool {
	if !slices.Contains(strings.Fields(identity.Scope), scope) {
		return false
	}
	return projectPublicID == "" || slices.Contains(identity.ProjectIDs, projectPublicID)
}

// FilterDelegatedProjects limits items to the projects granted to a delegated
// token; ordinary user requests are returned unchanged.
func FilterDelegatedProjects[T any](ctx context.Context, items []T, publicID func(T) string) []T {
	identity, delegated := DelegatedIdentity(ctx)
	if !delegated {
		return items
	}
	out := make([]T, 0, len(items))
	for _, item := range items {
		if slices.Contains(identity.ProjectIDs, publicID(item)) {
			out = append(out, item)
		}
	}
	return out
}

// DelegatedTagAllowed reports whether the tag may be attached by the request
// identity: attaching to one resource must not recolor a shared project tag.
func DelegatedTagAllowed(ctx context.Context, key, value string, color *string) bool {
	if _, delegated := DelegatedIdentity(ctx); !delegated {
		return true
	}
	return color == nil
}
