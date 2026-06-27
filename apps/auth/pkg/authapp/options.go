package authapp

import (
	"github.com/sb0rka/sb0rka/apps/auth/pkg/authhttp"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/invite"
)

type Options struct {
	// InviteRepositoryFactory builds the invite repository from the auth database.
	// Required together with InviteHookFactory for invite-enabled registration.
	InviteRepositoryFactory invite.RepositoryFactory

	// InviteHookFactory builds the invite hook from a repository.
	// Nil → invite.Noop().
	InviteHookFactory invite.HookFactory

	RouteFactories []authhttp.RoutesFactory
}
