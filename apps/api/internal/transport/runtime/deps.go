package runtime

import (
	"log/slog"

	"github.com/sb0rka/sb0rka/apps/api/internal/config"
	"github.com/sb0rka/sb0rka/apps/api/internal/store"
)

type Dependencies struct {
	PlatformDatabase store.Database
	Cfg              config.ServerConfig
	Log              *slog.Logger
}
