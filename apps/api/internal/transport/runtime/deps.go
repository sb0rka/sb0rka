package runtime

import (
	"log/slog"

	"github.com/sb0rka/sb0rka/apps/api/internal/authz"
	"github.com/sb0rka/sb0rka/apps/api/internal/config"
	"github.com/sb0rka/sb0rka/apps/api/internal/service"
	"github.com/sb0rka/sb0rka/apps/api/internal/store"
	"github.com/sb0rka/sb0rka/apps/api/internal/telemetry"
	"github.com/sb0rka/sb0rka/apps/api/pkg/account"
	"github.com/sb0rka/sb0rka/apps/api/pkg/membership"
	"github.com/sb0rka/sb0rka/apps/api/pkg/plan"
	"github.com/sb0rka/sb0rka/apps/api/pkg/quota"
	"github.com/sb0rka/sb0rka/apps/api/pkg/route"
	"github.com/sb0rka/sb0rka/apps/api/pkg/secret"
)

type Dependencies struct {
	PlatformDatabase store.Database
	Authorizer       authz.Authorizer
	SecretCrypto     service.SecretCrypto
	Telemetry        telemetry.Service
	AccountHook      account.Hook
	QuotaHook        quota.Hook
	MembershipHook   membership.Hook
	SecretHook       secret.Hook
	AdditionalRoutes []route.Route
	DefaultPlans     plan.Defaults
	Cfg              config.ServerConfig
	Log              *slog.Logger
}
