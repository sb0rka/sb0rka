package authapp

import "github.com/sb0rka/sb0rka/apps/auth/pkg/invite"

type Options struct {
	// InviteHookFactory builds the invite hook from the auth DB pool.
	// Nil → invite.Noop().
	InviteHookFactory invite.HookFactory
}
