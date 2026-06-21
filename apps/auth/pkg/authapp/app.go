package authapp

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/sb0rka/sb0rka/apps/auth/internal/authz"
	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	"github.com/sb0rka/sb0rka/apps/auth/internal/logger"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store"
	"github.com/sb0rka/sb0rka/apps/auth/internal/transport"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/registration"
	coretransport "github.com/sb0rka/sb0rka/packages/core/transport"
)

type App struct {
	opts Options
}

func New(opts Options) *App {
	return &App{opts: opts}
}

func (a *App) Run(ctx context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("failed to load configuration: %w", err)
	}

	log, err := logger.New(cfg.Logger)
	if err != nil {
		return fmt.Errorf("failed to initialize logger: %w", err)
	}
	slog.SetDefault(log)
	log.Info("logger initialized")

	log.Info("initializing database connection")
	database, err := store.CreateDatabase(
		cfg.Database.URI,
		cfg.Database.MaxConns,
		int64(cfg.Database.ConnMaxLifetime),
	)
	if err != nil {
		return fmt.Errorf("failed to initialize database connection: %w", err)
	}

	if err := database.TestConnection(ctx); err != nil {
		return fmt.Errorf("failed to test database connection: %w", err)
	}
	log.Info("database connection established successfully")

	hook := a.opts.RegistrationHook
	if hook == nil && a.opts.NewRegistrationHook != nil {
		pool, err := store.PgxPool(database)
		if err != nil {
			return fmt.Errorf("failed to resolve database pool for registration hook: %w", err)
		}
		hook = a.opts.NewRegistrationHook(pool)
	}
	if hook == nil {
		hook = registration.Noop()
	}

	newSrv := transport.NewServer(transport.Dependencies{
		Database:         database,
		Authorizer:       authz.NewRBACAuthorizer(database),
		Cfg:              cfg.Server,
		Log:              log,
		RegistrationHook: hook,
	})
	handler := newSrv.BuildCommonHandler()
	addr := fmt.Sprintf("%s:%s", cfg.Server.Addr, cfg.Server.Port)

	return coretransport.Run(ctx, addr, *handler, log, func() {
		_ = database.Close()
	})
}
