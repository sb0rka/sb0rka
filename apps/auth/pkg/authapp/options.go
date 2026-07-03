package authapp

import (
	"github.com/sb0rka/sb0rka/apps/auth/pkg/invite"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/route"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/subject"
)

type Options struct {
	// InviteRepositoryFactory builds the invite repository from the auth database.
	// Required together with InviteHookFactory for invite-enabled registration.
	InviteRepositoryFactory invite.RepositoryFactory

	// InviteHookFactory builds the invite hook from a repository.
	// Nil → invite.Noop().
	InviteHookFactory invite.HookFactory

	RouteFactories []route.RoutesFactory

	// SubjectResolverFactories extend GET /auth/subject with profile
	// resolvers for additional subject kinds.
	SubjectResolverFactories []subject.ResolverFactory
}
