package runtime

import (
	"log/slog"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/invite"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/route"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/subject"
)

type Dependencies struct {
	Database         db.Database
	Cfg              config.ServerConfig
	Log              *slog.Logger
	InviteHook       invite.Hook
	Routes           []route.Route
	SubjectResolvers map[string]subject.ProfileResolver
}
