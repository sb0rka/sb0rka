package logger

import (
	"fmt"
	"log/slog"
	"os"
	"strings"

	"github.com/sb0rka/sb0rka/apps/api/internal/config"
)

func New(lc config.LoggerConfig) (*slog.Logger, error) {
	var logHandler slog.Handler

	level := strings.ToLower(strings.TrimSpace(lc.Level))
	if level == "" {
		level = "info"
	}

	// Parse and validate the log level
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

	// Parse and validate the log format
	switch format {
	case "json":
		logHandler = slog.NewJSONHandler(os.Stdout, logOpts)
	case "text":
		logHandler = slog.NewTextHandler(os.Stdout, logOpts)
	default:
		return nil, fmt.Errorf("invalid log format: %s", lc.Format)
	}

	log := slog.New(logHandler).With("service", "api")
	return log, nil
}
