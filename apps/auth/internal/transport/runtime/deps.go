package runtime

import (
	"log/slog"

	"github.com/sb0rka/sb0rka/apps/auth/internal/authz"
	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
)

type Dependencies struct {
	Database   db.Database
	Cfg        config.ServerConfig
	Log        *slog.Logger
	Authorizer authz.Authorizer
}
