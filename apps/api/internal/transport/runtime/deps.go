package runtime

import (
	"log/slog"

	"github.com/sb0rka/sb0rka/apps/api/internal/authz"
	"github.com/sb0rka/sb0rka/apps/api/internal/config"
	"github.com/sb0rka/sb0rka/apps/api/internal/service"
	"github.com/sb0rka/sb0rka/apps/api/internal/store"
	"github.com/sb0rka/sb0rka/apps/api/internal/telemetry"
)

type Dependencies struct {
	PlatformDatabase store.Database
	Authorizer       authz.Authorizer
	SecretCrypto     service.SecretCrypto
	Telemetry        telemetry.Service
	Cfg              config.ServerConfig
	Log              *slog.Logger
}
