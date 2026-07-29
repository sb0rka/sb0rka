package apiapp

import "github.com/sb0rka/sb0rka/apps/api/pkg/account"

type Options struct {
	// AccountRepositoryFactory builds private account-hook persistence on top
	// of the platform database. Required together with AccountHookFactory.
	AccountRepositoryFactory account.RepositoryFactory

	// AccountHookFactory builds the hook run before account initialization.
	// Nil, or an incomplete factory pair, means account.Noop().
	AccountHookFactory account.HookFactory
}
