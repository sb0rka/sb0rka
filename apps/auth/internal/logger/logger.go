package logger

import (
	"log/slog"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	corelog "github.com/sb0rka/sb0rka/packages/core/log"
)

func New(lc config.LoggerConfig) (*slog.Logger, error) {
	return corelog.New(lc, "auth")
}
