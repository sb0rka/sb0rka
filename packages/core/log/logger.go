package log

import (
	"fmt"
	"log/slog"
	"os"
	"strings"

	coreconfig "github.com/sb0rka/sb0rka/packages/core/config"
)

func New(lc coreconfig.LoggerConfig, service string) (*slog.Logger, error) {
	var logHandler slog.Handler

	level := strings.ToLower(strings.TrimSpace(lc.Level))
	if level == "" {
		level = "info"
	}

	var logLevel slog.Level
	switch level {
	case "debug":
		logLevel = slog.LevelDebug
	case "info":
		logLevel = slog.LevelInfo
	case "warn":
		logLevel = slog.LevelWarn
	case "error":
		logLevel = slog.LevelError
	default:
		return nil, fmt.Errorf("invalid log level: %s", lc.Level)
	}

	logOpts := &slog.HandlerOptions{
		Level: logLevel,
	}

	format := strings.ToLower(strings.TrimSpace(lc.Format))
	if format == "" {
		format = "text"
	}

	switch format {
	case "json":
		logHandler = slog.NewJSONHandler(os.Stdout, logOpts)
	case "text":
		logHandler = slog.NewTextHandler(os.Stdout, logOpts)
	default:
		return nil, fmt.Errorf("invalid log format: %s", lc.Format)
	}

	return slog.New(logHandler).With("service", service), nil
}
