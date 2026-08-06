package authapp

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/sb0rka/sb0rka/apps/auth/internal/config"
	"github.com/sb0rka/sb0rka/apps/auth/internal/domain/model"
	"github.com/sb0rka/sb0rka/apps/auth/internal/logger"
	"github.com/sb0rka/sb0rka/apps/auth/internal/store"
	"github.com/sb0rka/sb0rka/apps/auth/internal/transport"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/invite"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/route"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/subject"
	"github.com/sb0rka/sb0rka/apps/auth/pkg/verification"
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
	// After Run returns (post http.Server.Shutdown) or on setup failure — not via
	// Run's pre-Shutdown hooks, which would close the pool under in-flight requests.
	defer func() {
		log.Info("closing database connection")
		_ = database.Close()
	}()

	if err := database.TestConnection(ctx); err != nil {
		return fmt.Errorf("failed to test database connection: %w", err)
	}
	log.Info("database connection established successfully")

	inviteHook := invite.Noop()
	if a.opts.InviteRepositoryFactory != nil && a.opts.InviteHookFactory != nil {
		repo := a.opts.InviteRepositoryFactory(database.PgxPool())
		inviteHook = a.opts.InviteHookFactory(repo)
	}

	verificationHook := verification.Noop()
	if a.opts.VerificationRepositoryFactory != nil && a.opts.VerificationHookFactory != nil {
		repo := a.opts.VerificationRepositoryFactory(database.PgxPool())
		verificationHook = a.opts.VerificationHookFactory(repo)
	}

	var routes []route.Route
	if cfg.Server.OIDC != nil {
		log.Info("OIDC provider enabled", "client_id", cfg.Server.OIDC.ClientID)
	}
	for _, build := range a.opts.RouteFactories {
		if build == nil {
			continue
		}
		routes = append(routes, build(database.PgxPool())...)
	}

	resolvers := make(map[string]subject.ProfileResolver)
	for _, build := range a.opts.SubjectResolverFactories {
		if build == nil {
			continue
		}
		for kind, resolve := range build(database.PgxPool()) {
			if resolve == nil {
				return fmt.Errorf("subject resolver for kind %q is nil", kind)
			}
			if kind == model.SubjectKindUser {
				return fmt.Errorf("subject resolver for kind %q conflicts with built-in user resolution", kind)
			}
			if _, dup := resolvers[kind]; dup {
				return fmt.Errorf("duplicate subject resolver registration for kind %q", kind)
			}
			resolvers[kind] = resolve
		}
	}

	newSrv := transport.NewServer(transport.Dependencies{
		Database:         database,
		Cfg:              cfg.Server,
		Log:              log,
		InviteHook:       inviteHook,
		VerificationHook: verificationHook,
		Routes:           routes,
		SubjectResolvers: resolvers,
	})
	handler, err := newSrv.BuildCommonHandler()
	if err != nil {
		return fmt.Errorf("failed to build HTTP handler: %w", err)
	}
	addr := fmt.Sprintf("%s:%s", cfg.Server.Addr, cfg.Server.Port)

	return coretransport.Run(ctx, addr, *handler, log)
}
