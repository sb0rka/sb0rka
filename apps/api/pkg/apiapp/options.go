package apiapp

import (
	"github.com/sb0rka/sb0rka/apps/api/pkg/account"
	"github.com/sb0rka/sb0rka/apps/api/pkg/membership"
	"github.com/sb0rka/sb0rka/apps/api/pkg/plan"
	"github.com/sb0rka/sb0rka/apps/api/pkg/quota"
	"github.com/sb0rka/sb0rka/apps/api/pkg/route"
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

	// MembershipRepositoryFactory and MembershipHookFactory activate project
	// membership policy together. Nil, or an incomplete pair, leaves
	// membership.Noop() active (any allowed subject kind may be granted).
	MembershipRepositoryFactory membership.RepositoryFactory
	MembershipHookFactory       membership.HookFactory

	// RouteFactories register routes implemented outside this module.
	// Each factory receives the pool and AuthorizeProjectRead.
	RouteFactories []route.RoutesFactory
}
