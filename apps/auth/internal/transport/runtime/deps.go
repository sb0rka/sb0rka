package runtime

import (
	"log/slog"

	"github.com/sb0rka/sb0rka/apps/auth/internal/authz"
	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/registration"
)

type Dependencies struct {
	Database         db.Database
	Cfg              config.ServerConfig
	Log              *slog.Logger
	Authorizer       authz.Authorizer
	RegistrationHook registration.Hook
}
