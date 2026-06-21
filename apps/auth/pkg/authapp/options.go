package authapp

import "github.com/sb0rka/sb0rka/apps/auth/pkg/registration"

type Options struct {
	// RegistrationHookFactory builds the registration hook from the auth DB pool.
	// Nil → registration.Noop().
	RegistrationHookFactory registration.HookFactory
}
