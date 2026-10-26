package apiapp

import (
	"github.com/sb0rka/sb0rka/apps/api/pkg/account"
	"github.com/sb0rka/sb0rka/apps/api/pkg/plan"
	"github.com/sb0rka/sb0rka/apps/api/pkg/quota"
)

type Options struct {
	// DefaultPlans defaults to the community account and project plans.
	DefaultPlans plan.Defaults

	// AccountRepositoryFactory builds private account-hook persistence on top
	// of the platform database. Required together with AccountHookFactory.
	AccountRepositoryFactory account.RepositoryFactory

	// AccountHookFactory builds the hook run before account initialization.
	// Nil, or an incomplete factory pair, means account.Noop().
	AccountHookFactory account.HookFactory

	// QuotaRepositoryFactory and QuotaHookFactory activate quota policy together.
	// Nil, or an incomplete pair, leaves quota.Noop() active.
	QuotaRepositoryFactory quota.RepositoryFactory
	QuotaHookFactory       quota.HookFactory
}
