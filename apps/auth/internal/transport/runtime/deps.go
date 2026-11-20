package runtime

import (
	"log/slog"

	"github.com/sb0rka/sb0rka/apps/auth/internal/captcha"
	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store/db"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/invite"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/oidcaccess"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/route"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/subject"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/verification"
)

type Dependencies struct {
	Captcha              *captcha.Client
	Database             db.Database
	Cfg                  config.ServerConfig
	Log                  *slog.Logger
	InviteHook           invite.Hook
	OIDCAccessHook       oidcaccess.Hook
	VerificationHook     verification.Hook
	TrustEmailOnRegister bool // TrustEmailOnRegister stamps email_verified_at during community signup.
	AdditionalRoutes     []route.Route
	SubjectResolvers     map[string]subject.ProfileResolver
}
